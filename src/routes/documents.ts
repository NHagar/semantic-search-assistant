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
import { IngestionService } from '../services/ingestion.js';
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

  // Start background ingestion for any new uploads
  IngestionService.processProjectFiles(projectId).catch(err => {
    console.error('Background ingestion failed:', err);
  });

  return c.json({
    success: true,
    data: { uploaded, errors },
  });
});

// Extract text from uploaded PDFs
app.post('/extract', async (c) => {
  const projectId = c.get('projectId');
  const result = await IngestionService.extractPendingFiles(projectId);

  if (result.extracted.length === 0 && result.errors.length === 0) {
    return c.json({ success: false, error: 'No pending files to extract' }, 400);
  }

  return c.json({
    success: true,
    data: result,
  });
});

// Embed documents into vector store
// Embed documents into vector store
app.post('/embed', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const options = embedOptionsSchema.parse(body);

  const result = await IngestionService.embedProjectDocuments(projectId, options);

  if (result.embedded.length === 0 && result.errors.length === 0) {
    return c.json({ success: false, error: 'No documents to embed' }, 400);
  }

  return c.json({
    success: true,
    data: result,
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
