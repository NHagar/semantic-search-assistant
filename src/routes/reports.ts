import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { generateId } from '../utils/id.js';
import { llmClient } from '../services/llm-client.js';
import { prompts } from '../services/prompts.js';
import { SearchAgent } from '../services/search-agent.js';
import type { SearchReport, SearchPlan } from '../types/index.js';

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

const updateReportSchema = z.object({
  report_contents: z.string().optional(),
  passed_evaluation: z.boolean().optional(),
});

// List all reports
app.get('/', (c) => {
  const projectId = c.get('projectId');
  const db = getDb();

  const reports = db.prepare(`
    SELECT sr.*, sp.plan_name, sp.main_objective
    FROM search_reports sr
    JOIN search_plans sp ON sr.search_plan_id = sp.id
    WHERE sr.project_id = ?
    ORDER BY sr.created_at
  `).all(projectId);

  return c.json({ success: true, data: reports });
});

// Execute selected plans
app.post('/execute', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;

  const db = getDb();

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as { id: string; model_text: string } | undefined;
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Get selected plans
  const plans = db.prepare(`
    SELECT * FROM search_plans
    WHERE project_id = ? AND is_selected = 1
  `).all(projectId) as SearchPlan[];

  if (plans.length === 0) {
    return c.json({ success: false, error: 'No plans selected for execution' }, 400);
  }

  const results: Array<{
    plan_id: string;
    plan_name: string;
    report_id: string;
    iterations: number;
    searches: number;
  }> = [];

  const errors: Array<{ plan_name: string; error: string }> = [];

  for (const plan of plans) {
    try {
      const agent = new SearchAgent(projectId);
      const result = await agent.executeSearchPlan(plan.content, model ?? project.model_text);

      // Save report
      const reportId = generateId('rpt');
      db.prepare(`
        INSERT INTO search_reports (id, project_id, search_plan_id, report_contents)
        VALUES (?, ?, ?, ?)
      `).run(reportId, projectId, plan.id, result.report);

      // Save search queries
      const insertQuery = db.prepare(`
        INSERT INTO search_queries (id, report_id, query, results_returned)
        VALUES (?, ?, ?, ?)
      `);

      for (const search of result.searches) {
        insertQuery.run(generateId('qry'), reportId, search.query, JSON.stringify(search.results));
      }

      results.push({
        plan_id: plan.id,
        plan_name: plan.plan_name,
        report_id: reportId,
        iterations: result.iterations,
        searches: result.searches.length,
      });
    } catch (error) {
      errors.push({ plan_name: plan.plan_name, error: String(error) });
    }
  }

  return c.json({ success: true, data: { results, errors } });
});

// Get single report
app.get('/:reportId', (c) => {
  const projectId = c.get('projectId');
  const reportId = c.req.param('reportId');
  const db = getDb();

  const report = db.prepare(`
    SELECT sr.*, sp.plan_name, sp.main_objective, sp.content as plan_content
    FROM search_reports sr
    JOIN search_plans sp ON sr.search_plan_id = sp.id
    WHERE sr.id = ? AND sr.project_id = ?
  `).get(reportId, projectId);

  if (!report) {
    return c.json({ success: false, error: 'Report not found' }, 404);
  }

  // Get searches for this report
  const searches = db.prepare(`
    SELECT * FROM search_queries WHERE report_id = ?
  `).all(reportId);

  return c.json({ success: true, data: { ...report, searches } });
});

// Update report
app.patch('/:reportId', async (c) => {
  const projectId = c.get('projectId');
  const reportId = c.req.param('reportId');
  const body = await c.req.json();
  const parsed = updateReportSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const db = getDb();

  const report = db.prepare(`
    SELECT * FROM search_reports WHERE id = ? AND project_id = ?
  `).get(reportId, projectId);

  if (!report) {
    return c.json({ success: false, error: 'Report not found' }, 404);
  }

  const updates = parsed.data;
  const fields = Object.entries(updates).filter(([_, v]) => v !== undefined);

  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  const setClause = fields.map(([k]) => `${k} = ?`).join(', ');
  const values = fields.map(([_, v]) => typeof v === 'boolean' ? (v ? 1 : 0) : v);

  db.prepare(`
    UPDATE search_reports SET ${setClause}, updated_at = datetime('now')
    WHERE id = ?
  `).run(...values, reportId);

  const updated = db.prepare(`SELECT * FROM search_reports WHERE id = ?`).get(reportId);
  return c.json({ success: true, data: updated });
});

// Delete report
app.delete('/:reportId', (c) => {
  const projectId = c.get('projectId');
  const reportId = c.req.param('reportId');
  const db = getDb();

  const report = db.prepare(`
    SELECT id FROM search_reports WHERE id = ? AND project_id = ?
  `).get(reportId, projectId);

  if (!report) {
    return c.json({ success: false, error: 'Report not found' }, 404);
  }

  db.prepare(`DELETE FROM search_reports WHERE id = ?`).run(reportId);

  return c.json({ success: true, data: { deleted: reportId } });
});

// Regenerate report from plan
app.post('/:reportId/regenerate', async (c) => {
  const projectId = c.get('projectId');
  const reportId = c.req.param('reportId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;

  const db = getDb();

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as { id: string; model_text: string } | undefined;
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const report = db.prepare(`
    SELECT sr.*, sp.content as plan_content
    FROM search_reports sr
    JOIN search_plans sp ON sr.search_plan_id = sp.id
    WHERE sr.id = ? AND sr.project_id = ?
  `).get(reportId, projectId) as { id: string; search_plan_id: string; plan_content: string } | undefined;

  if (!report) {
    return c.json({ success: false, error: 'Report not found' }, 404);
  }

  // Delete old search queries
  db.prepare(`DELETE FROM search_queries WHERE report_id = ?`).run(reportId);

  // Re-execute search plan
  const agent = new SearchAgent(projectId);
  const result = await agent.executeSearchPlan(report.plan_content, model ?? project.model_text);

  // Update report
  db.prepare(`
    UPDATE search_reports SET report_contents = ?, passed_evaluation = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(result.report, reportId);

  // Save new search queries
  const insertQuery = db.prepare(`
    INSERT INTO search_queries (id, report_id, query, results_returned)
    VALUES (?, ?, ?, ?)
  `);

  for (const search of result.searches) {
    insertQuery.run(generateId('qry'), reportId, search.query, JSON.stringify(search.results));
  }

  const updated = db.prepare(`SELECT * FROM search_reports WHERE id = ?`).get(reportId);

  return c.json({
    success: true,
    data: {
      report: updated,
      iterations: result.iterations,
      searches: result.searches,
    },
  });
});

export default app;
