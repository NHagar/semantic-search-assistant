import { Hono } from 'hono';
import { z } from 'zod';
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/client.js';
import { generateId } from '../utils/id.js';
import { sanitizeFilename } from '../utils/sanitize.js';
import { extractTextFromBuffer } from '../services/pdf-extractor.js';
import { vectorStore } from '../services/vector-store.js';
import { countTokens } from '../services/chunker.js';
import { config } from '../config/index.js';
import type { Document, UploadedFile } from '../types/index.js';

type Variables = { projectId: string };

const app = new Hono<{ Variables: Variables }>();

// Middleware to extract and validate project ID
app.use('*', async (c, next) => {
  const projectId = c.req.param('id') as string;
  if (!projectId) {
    return c.json({ success: false, error: 'Project ID required' }, 400);
  }
  c.set('projectId', projectId);
  await next();
});

const embedOptionsSchema = z.object({
  chunk_size: z.number().int().min(100).max(2048).optional().default(512),
  overlap: z.number().int().min(0).max(200).optional().default(50),
});

// Ensure upload directory exists for a project
async function ensureUploadDir(projectId: string): Promise<string> {
  const uploadDir = join(config.UPLOADS_PATH, projectId);
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }
  return uploadDir;
}

// List all documents for a project
app.get('/', (c) => {
  const projectId = c.get('projectId');
  const status = c.req.query('status'); // Optional filter

  const db = getDb();

  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  let query = `SELECT * FROM documents WHERE project_id = ?`;
  const params: string[] = [projectId];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC`;

  const documents = db.prepare(query).all(...params) as Document[];

  return c.json({ success: true, data: documents });
});

// Upload PDF files
app.post('/upload', async (c) => {
  const projectId = c.get('projectId');
  const db = getDb();

  // Check project exists
  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const formData = await c.req.formData();
  const files = formData.getAll('files') as File[];

  if (files.length === 0) {
    return c.json({ success: false, error: 'No files provided' }, 400);
  }

  const uploadDir = await ensureUploadDir(projectId);
  const uploaded: UploadedFile[] = [];
  const errors: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      errors.push({ filename: file.name, error: 'Only PDF files are supported' });
      continue;
    }

    const sanitizedName = sanitizeFilename(file.name);
    const filePath = join(uploadDir, sanitizedName);
    const id = generateId('file');

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      db.prepare(`
        INSERT INTO uploaded_files (id, project_id, filename, original_filename, file_path, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, projectId, sanitizedName, file.name, filePath, file.size, file.type);

      const uploadedFile = db.prepare(`SELECT * FROM uploaded_files WHERE id = ?`).get(id) as UploadedFile;
      uploaded.push(uploadedFile);
    } catch (error) {
      errors.push({ filename: file.name, error: String(error) });
    }
  }

  return c.json({
    success: true,
    data: { uploaded, errors },
  });
});

// Extract text from uploaded PDFs
app.post('/extract', async (c) => {
  const projectId = c.get('projectId');
  const db = getDb();

  // Get pending uploaded files
  const uploadedFiles = db.prepare(`
    SELECT * FROM uploaded_files
    WHERE project_id = ? AND status = 'pending'
  `).all(projectId) as UploadedFile[];

  if (uploadedFiles.length === 0) {
    return c.json({ success: false, error: 'No pending files to extract' }, 400);
  }

  const extracted: Document[] = [];
  const errors: Array<{ filename: string; error: string }> = [];

  for (const file of uploadedFiles) {
    try {
      // Update status to processing
      db.prepare(`UPDATE uploaded_files SET status = 'processing' WHERE id = ?`).run(file.id);

      // Extract text
      const buffer = await readFile(file.file_path);
      const result = await extractTextFromBuffer(buffer);

      // Create document record
      const docId = generateId('doc');
      const tokenCount = countTokens(result.text);

      db.prepare(`
        INSERT INTO documents (id, project_id, filename, original_filename, content, file_size, page_count, token_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'extracted')
      `).run(docId, projectId, file.filename, file.original_filename, result.text, file.file_size, result.pageCount, tokenCount);

      // Update uploaded file status
      db.prepare(`UPDATE uploaded_files SET status = 'completed' WHERE id = ?`).run(file.id);

      // Clean up uploaded file
      await unlink(file.file_path);
      db.prepare(`DELETE FROM uploaded_files WHERE id = ?`).run(file.id);

      const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(docId) as Document;
      extracted.push(doc);
    } catch (error) {
      db.prepare(`UPDATE uploaded_files SET status = 'error' WHERE id = ?`).run(file.id);
      errors.push({ filename: file.filename, error: String(error) });
    }
  }

  return c.json({
    success: true,
    data: { extracted, errors },
  });
});

// Embed documents into vector store
app.post('/embed', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const options = embedOptionsSchema.parse(body);

  const db = getDb();

  // Get extracted documents not yet embedded
  const documents = db.prepare(`
    SELECT * FROM documents
    WHERE project_id = ? AND status = 'extracted'
  `).all(projectId) as Document[];

  if (documents.length === 0) {
    return c.json({ success: false, error: 'No documents to embed' }, 400);
  }

  const embedded: Array<{ id: string; filename: string; chunks: number }> = [];
  const errors: Array<{ filename: string; error: string }> = [];

  for (const doc of documents) {
    try {
      if (!doc.content) {
        errors.push({ filename: doc.filename, error: 'No content to embed' });
        continue;
      }

      const chunkCount = await vectorStore.embedDocument(
        projectId,
        doc.id,
        doc.content,
        options.chunk_size,
        options.overlap
      );

      // Update document status
      db.prepare(`
        UPDATE documents SET status = 'embedded', updated_at = datetime('now')
        WHERE id = ?
      `).run(doc.id);

      embedded.push({ id: doc.id, filename: doc.filename, chunks: chunkCount });
    } catch (error) {
      db.prepare(`
        UPDATE documents SET status = 'error', error_message = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(String(error), doc.id);
      errors.push({ filename: doc.filename, error: String(error) });
    }
  }

  return c.json({
    success: true,
    data: { embedded, errors },
  });
});

// Get single document
app.get('/:docId', (c) => {
  const projectId = c.get('projectId');
  const docId = c.req.param('docId');
  const db = getDb();

  const doc = db.prepare(`
    SELECT * FROM documents WHERE id = ? AND project_id = ?
  `).get(docId, projectId) as Document | undefined;

  if (!doc) {
    return c.json({ success: false, error: 'Document not found' }, 404);
  }

  return c.json({ success: true, data: doc });
});

// Update document content
app.patch('/:docId', async (c) => {
  const projectId = c.get('projectId');
  const docId = c.req.param('docId');
  const body = await c.req.json();

  if (!body.content || typeof body.content !== 'string') {
    return c.json({ success: false, error: 'Content is required' }, 400);
  }

  const db = getDb();

  const doc = db.prepare(`
    SELECT * FROM documents WHERE id = ? AND project_id = ?
  `).get(docId, projectId) as Document | undefined;

  if (!doc) {
    return c.json({ success: false, error: 'Document not found' }, 404);
  }

  const tokenCount = countTokens(body.content);

  // If document was embedded, delete old chunks and mark for re-embedding
  if (doc.status === 'embedded') {
    await vectorStore.deleteDocumentChunks(docId);
  }

  db.prepare(`
    UPDATE documents
    SET content = ?, token_count = ?, status = 'extracted', updated_at = datetime('now')
    WHERE id = ?
  `).run(body.content, tokenCount, docId);

  const updated = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(docId);
  return c.json({ success: true, data: updated });
});

// Delete document
app.delete('/:docId', async (c) => {
  const projectId = c.get('projectId');
  const docId = c.req.param('docId');
  const db = getDb();

  const doc = db.prepare(`
    SELECT * FROM documents WHERE id = ? AND project_id = ?
  `).get(docId, projectId) as Document | undefined;

  if (!doc) {
    return c.json({ success: false, error: 'Document not found' }, 404);
  }

  // Delete chunks from vector store
  await vectorStore.deleteDocumentChunks(docId);

  // Delete document
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(docId);

  return c.body(null, 204);
});

// Re-embed single document
app.post('/:docId/reembed', async (c) => {
  const projectId = c.get('projectId');
  const docId = c.req.param('docId');
  const body = await c.req.json().catch(() => ({}));
  const options = embedOptionsSchema.parse(body);

  const db = getDb();

  const doc = db.prepare(`
    SELECT * FROM documents WHERE id = ? AND project_id = ?
  `).get(docId, projectId) as Document | undefined;

  if (!doc) {
    return c.json({ success: false, error: 'Document not found' }, 404);
  }

  if (!doc.content) {
    return c.json({ success: false, error: 'Document has no content' }, 400);
  }

  // Delete existing chunks
  await vectorStore.deleteDocumentChunks(docId);

  // Re-embed
  const chunkCount = await vectorStore.embedDocument(
    projectId,
    docId,
    doc.content,
    options.chunk_size,
    options.overlap
  );

  db.prepare(`
    UPDATE documents SET status = 'embedded', updated_at = datetime('now')
    WHERE id = ?
  `).run(docId);

  return c.json({
    success: true,
    data: { id: docId, filename: doc.filename, chunks: chunkCount },
  });
});

export default app;
