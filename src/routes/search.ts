import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { vectorStore } from '../services/vector-store.js';

type Variables = { projectId: string };

const app = new Hono<{ Variables: Variables }>();

// Middleware to extract project ID
app.use('*', async (c, next) => {
  const projectId = c.req.param('id') as string;
  if (!projectId) {
    return c.json({ success: false, error: 'Project ID required' }, 400);
  }
  c.set('projectId', projectId);
  await next();
});

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(5),
});

// Semantic search
app.post('/', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json();
  const parsed = searchSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const db = getDb();

  // Check project exists
  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const { query, limit } = parsed.data;
  const results = await vectorStore.search(projectId, query, limit);

  return c.json({ success: true, data: results });
});

// Get citation source with context
app.get('/citation/:key', async (c) => {
  const projectId = c.get('projectId');
  const citationKey = c.req.param('key') as string;

  const db = getDb();

  // Check project exists
  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const source = await vectorStore.getCitationSource(projectId, citationKey);

  if (!source) {
    return c.json({ success: false, error: 'Citation not found' }, 404);
  }

  return c.json({ success: true, data: source });
});

export default app;
