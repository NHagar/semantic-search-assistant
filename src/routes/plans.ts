import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { generateId } from '../utils/id.js';
import { llmClient } from '../services/llm-client.js';
import { prompts } from '../services/prompts.js';
import { SearchAgent } from '../services/search-agent.js';
import type { SearchPlan } from '../types/index.js';

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

const updatePlanSchema = z.object({
  plan_name: z.string().min(1).optional(),
  main_objective: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  is_selected: z.boolean().optional(),
});

// List all search plans
app.get('/', (c) => {
  const projectId = c.get('projectId');
  const db = getDb();

  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const plans = db.prepare(`
    SELECT * FROM search_plans
    WHERE project_id = ?
    ORDER BY created_at
  `).all(projectId) as SearchPlan[];

  return c.json({ success: true, data: plans });
});

// Generate new search plans
app.post('/generate', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;

  const db = getDb();

  // Get project with synopsis
  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ?
  `).get(projectId) as { id: string; model_text: string; corpus_synopsis: string | null } | undefined;

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  if (!project.corpus_synopsis) {
    return c.json({ success: false, error: 'Corpus synopsis required. Run compress first.' }, 400);
  }

  // Generate plans using LLM
  const response = await llmClient.chat([
    { role: 'system', content: prompts.plan },
    { role: 'user', content: `Based on this corpus description, generate comprehensive search plans:\n\n${project.corpus_synopsis}` },
  ], model ?? project.model_text);

  const content = response.choices[0].message.content || '';

  // Parse plans from response
  const planRegex = /\*\*SEARCH PLAN #(\d+)\*\*([\s\S]*?)(?=\*\*SEARCH PLAN #|$)/g;
  const plans: Array<{ name: string; objective: string; content: string }> = [];

  let match;
  while ((match = planRegex.exec(content)) !== null) {
    const planNum = match[1];
    const planContent = match[0].trim();

    // Extract objective
    const objectiveMatch = planContent.match(/OBJECTIVE:\s*(.+?)(?=\n|SPECIFIC)/s);
    const objective = objectiveMatch ? objectiveMatch[1].trim() : `Search Plan ${planNum}`;

    plans.push({
      name: `search_plan_${planNum}`,
      objective,
      content: planContent,
    });
  }

  if (plans.length === 0) {
    return c.json({ success: false, error: 'Failed to parse search plans from LLM response' }, 500);
  }

  // Delete existing plans for this project
  db.prepare(`DELETE FROM search_plans WHERE project_id = ?`).run(projectId);

  // Insert new plans
  const insertPlan = db.prepare(`
    INSERT INTO search_plans (id, project_id, plan_name, main_objective, content, is_selected)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const createdPlans: SearchPlan[] = [];

  db.transaction(() => {
    for (const plan of plans) {
      const id = generateId('plan');
      insertPlan.run(id, projectId, plan.name, plan.objective, plan.content, 0);
      const created = db.prepare(`SELECT * FROM search_plans WHERE id = ?`).get(id) as SearchPlan;
      createdPlans.push(created);
    }
  })();

  return c.json({ success: true, data: createdPlans });
});

// Get single plan
app.get('/:planId', (c) => {
  const projectId = c.get('projectId');
  const planId = c.req.param('planId');
  const db = getDb();

  const plan = db.prepare(`
    SELECT * FROM search_plans WHERE id = ? AND project_id = ?
  `).get(planId, projectId) as SearchPlan | undefined;

  if (!plan) {
    return c.json({ success: false, error: 'Plan not found' }, 404);
  }

  return c.json({ success: true, data: plan });
});

// Update plan
app.patch('/:planId', async (c) => {
  const projectId = c.get('projectId');
  const planId = c.req.param('planId');
  const body = await c.req.json();
  const parsed = updatePlanSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }

  const db = getDb();

  const plan = db.prepare(`
    SELECT * FROM search_plans WHERE id = ? AND project_id = ?
  `).get(planId, projectId);

  if (!plan) {
    return c.json({ success: false, error: 'Plan not found' }, 404);
  }

  const updates = parsed.data;
  const fields = Object.entries(updates).filter(([_, v]) => v !== undefined);

  if (fields.length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400);
  }

  const setClause = fields.map(([k]) => `${k} = ?`).join(', ');
  const values = fields.map(([_, v]) => typeof v === 'boolean' ? (v ? 1 : 0) : v);

  db.prepare(`
    UPDATE search_plans SET ${setClause}, updated_at = datetime('now')
    WHERE id = ?
  `).run(...values, planId);

  const updated = db.prepare(`SELECT * FROM search_plans WHERE id = ?`).get(planId);
  return c.json({ success: true, data: updated });
});

// Delete plan
app.delete('/:planId', (c) => {
  const projectId = c.get('projectId');
  const planId = c.req.param('planId');
  const db = getDb();

  const plan = db.prepare(`
    SELECT id FROM search_plans WHERE id = ? AND project_id = ?
  `).get(planId, projectId);

  if (!plan) {
    return c.json({ success: false, error: 'Plan not found' }, 404);
  }

  db.prepare(`DELETE FROM search_plans WHERE id = ?`).run(planId);

  return c.json({ success: true, data: { deleted: planId } });
});

// Execute single plan
app.post('/:planId/execute', async (c) => {
  const projectId = c.get('projectId');
  const planId = c.req.param('planId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;

  const db = getDb();

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as { id: string; model_text: string } | undefined;
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const plan = db.prepare(`
    SELECT * FROM search_plans WHERE id = ? AND project_id = ?
  `).get(planId, projectId) as SearchPlan | undefined;

  if (!plan) {
    return c.json({ success: false, error: 'Plan not found' }, 404);
  }

  // Execute search plan
  const agent = new SearchAgent(projectId);
  const result = await agent.executeSearchPlan(plan.content, model ?? project.model_text);

  // Save report
  const reportId = generateId('rpt');
  db.prepare(`
    INSERT INTO search_reports (id, project_id, search_plan_id, report_contents)
    VALUES (?, ?, ?, ?)
  `).run(reportId, projectId, planId, result.report);

  // Save search queries
  const insertQuery = db.prepare(`
    INSERT INTO search_queries (id, report_id, query, results_returned)
    VALUES (?, ?, ?, ?)
  `);

  for (const search of result.searches) {
    insertQuery.run(generateId('qry'), reportId, search.query, JSON.stringify(search.results));
  }

  const report = db.prepare(`SELECT * FROM search_reports WHERE id = ?`).get(reportId);

  return c.json({
    success: true,
    data: {
      report,
      iterations: result.iterations,
      searches: result.searches,
    },
  });
});

export default app;
