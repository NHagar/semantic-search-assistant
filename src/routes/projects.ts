import { Hono } from 'hono';
import { z } from 'zod';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, parse } from 'path';
import { getDb } from '../db/client.js';
import { generateId } from '../utils/id.js';
import { config } from '../config/index.js';
import { sanitizeFilename } from '../utils/sanitize.js';
import type { Project, CreateProjectInput, UpdateProjectInput, UploadedFile } from '../types/index.js';
import { IngestionService } from '../services/ingestion.js';

const app = new Hono();

const createProjectSchema = z.object({
  project_name: z.string().min(1).max(255),
  model_text: z.string().optional().default(config.DEFAULT_MODEL),
  model_embedding: z.string().optional().default(config.EMBEDDING_MODEL),
});

const updateProjectSchema = z.object({
  project_name: z.string().min(1).max(255).optional(),
  model_text: z.string().optional(),
  corpus_synopsis: z.string().optional(),
  final_report: z.string().optional(),
});

// List all projects
app.get('/', (c) => {
  const db = getDb();

  const projects = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.status = 'embedded') as document_count,
      (SELECT COUNT(*) FROM chunks c WHERE c.project_id = p.id) as chunk_count
    FROM projects p
    ORDER BY p.updated_at DESC
  `).all() as Array<Project & { document_count: number; chunk_count: number }>;

  return c.json({ success: true, data: projects });
});

// Create project
// Create project
app.post('/', async (c) => {
  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const files = formData.getAll('files') as File[]; // Accepts 'files' or 'file'? checks below

    // If 'files' is empty, maybe they sent 'file'?
    // But frontend usually sends 'files' if we set it so. The plan says "files".
    // Let's support both just in case or just stick to 'files'.
    // The previous frontend code sent 'file'. I will update frontend to send 'files'.
    // But let's be robust. 

    const validFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));

    if (validFiles.length === 0) {
      return c.json({ success: false, error: 'No PDF files provided' }, 400);
    }

    const db = getDb();
    const id = generateId('proj');
    // Derive project name from first file
    const firstFile = validFiles[0];
    const projectName = parse(firstFile.name).name; // name without extension

    const model_text = config.DEFAULT_MODEL;
    const model_embedding = config.EMBEDDING_MODEL;

    try {
      // 1. Create Project
      db.prepare(`
        INSERT INTO projects (id, project_name, model_text, model_embedding)
        VALUES (?, ?, ?, ?)
      `).run(id, projectName, model_text, model_embedding);

      // 2. Save Files
      const uploadDir = join(config.UPLOADS_PATH, id);
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      const uploaded: UploadedFile[] = [];

      for (const file of validFiles) {
        const sanitizedName = sanitizeFilename(file.name);
        const filePath = join(uploadDir, sanitizedName);
        const fileId = generateId('file');

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, buffer);

        db.prepare(`
          INSERT INTO uploaded_files (id, project_id, filename, original_filename, file_path, file_size, mime_type)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(fileId, id, sanitizedName, file.name, filePath, file.size, file.type);

        const uploadedFile = db.prepare(`SELECT * FROM uploaded_files WHERE id = ?`).get(fileId) as UploadedFile;
        uploaded.push(uploadedFile);
      }

      const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Project;


      // Trigger background processing
      IngestionService.processProjectFiles(id).catch(err => {
        console.error('Background ingestion failed:', err);
      });

      return c.json({ success: true, data: project, uploaded }, 201);

    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        // If auto-generated name exists, maybe append timestamp? 
        // For now, let's just return error, or we could make it unique. 
        // The user can rename later.
        return c.json({ success: false, error: 'Project with this name already exists' }, 409);
      }
      throw error;
    }

  } else {
    // JSON handling
    const body = await c.req.json();
    const parsed = createProjectSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.message }, 400);
    }

    const db = getDb();
    const id = generateId('proj');
    const { project_name, model_text, model_embedding } = parsed.data;

    try {
      db.prepare(`
        INSERT INTO projects (id, project_name, model_text, model_embedding)
        VALUES (?, ?, ?, ?)
      `).run(id, project_name, model_text, model_embedding);

      const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Project;

      return c.json({ success: true, data: project }, 201);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        return c.json({ success: false, error: 'Project name already exists' }, 409);
      }
      throw error;
    }
  }
});

// Get project by ID
app.get('/:id', (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const project = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.status = 'embedded') as document_count,
      (SELECT COUNT(*) FROM uploaded_files uf WHERE uf.project_id = p.id AND uf.status = 'pending') as pending_upload_count,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.status = 'extracted') as extracted_document_count,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.status = 'error') as error_document_count,
      (SELECT COUNT(*) FROM uploaded_files uf WHERE uf.project_id = p.id) as uploaded_file_count,
      (SELECT COUNT(*) FROM chunks c WHERE c.project_id = p.id) as chunk_count,
      (SELECT COUNT(*) FROM search_plans sp WHERE sp.project_id = p.id) as plan_count,
      (SELECT COUNT(*) FROM search_reports sr WHERE sr.project_id = p.id) as report_count
    FROM projects p
    WHERE p.id = ?
  `).get(id) as (Project & {
    document_count: number;
    pending_upload_count: number;
    extracted_document_count: number;
    error_document_count: number;
    uploaded_file_count: number;
    chunk_count: number;
    plan_count: number;
    report_count: number;
  }) | undefined;

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Kick off ingestion in the background when there is pending work
  if (
    project.pending_upload_count > 0 ||
    project.extracted_document_count > 0 ||
    project.error_document_count > 0
  ) {
    IngestionService.processProjectFiles(id).catch(err => {
      console.error('Background ingestion failed:', err);
    });
  }

  return c.json({ success: true, data: project });
});

// Update project
app.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = updateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const db = getDb();
  const updates = parsed.data;

  // Check project exists
  const existing = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id);
  if (!existing) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Build dynamic update query
  const fields = Object.entries(updates).filter(([_, v]) => v !== undefined);
  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  const setClause = fields.map(([k]) => `${k} = ?`).join(', ');
  const values = fields.map(([_, v]) => v);

  try {
    db.prepare(`
      UPDATE projects SET ${setClause}, updated_at = datetime('now')
      WHERE id = ?
    `).run(...values, id);

    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    return c.json({ success: true, data: project });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      return c.json({ success: false, error: 'Project name already exists' }, 409);
    }
    throw error;
  }
});

// Delete project
app.delete('/:id', (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const existing = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(id);
  if (!existing) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // CASCADE will handle related records
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);

  return c.body(null, 204);
});

export default app;
