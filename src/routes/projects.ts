import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { generateId } from '../utils/id.js';
import { config } from '../config/index.js';
import type { Project, CreateProjectInput, UpdateProjectInput } from '../types/index.js';

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
app.post('/', async (c) => {
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
});

// Get project by ID
app.get('/:id', (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const project = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.status = 'embedded') as document_count,
      (SELECT COUNT(*) FROM chunks c WHERE c.project_id = p.id) as chunk_count,
      (SELECT COUNT(*) FROM search_plans sp WHERE sp.project_id = p.id) as plan_count,
      (SELECT COUNT(*) FROM search_reports sr WHERE sr.project_id = p.id) as report_count
    FROM projects p
    WHERE p.id = ?
  `).get(id);

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
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

  return c.json({ success: true, data: { deleted: id } });
});

export default app;
