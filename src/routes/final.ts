import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '../db/client.js';
import { llmClient } from '../services/llm-client.js';
import { prompts } from '../services/prompts.js';
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

// Get final report
app.get('/', (c) => {
  const projectId = c.get('projectId');
  const db = getDb();

  // Check project exists first (even if no report)
  const projectCheck = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!projectCheck) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const project = db.prepare(`
    SELECT final_report FROM projects WHERE id = ?
  `).get(projectId) as { final_report: string | null } | undefined;

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  return c.json({ success: true, data: { final_report: project.final_report } });
});

// Update final report
app.put('/', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json();

  if (!body.final_report || typeof body.final_report !== 'string') {
    return c.json({ success: false, error: 'final_report is required' }, 400);
  }

  const db = getDb();

  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  db.prepare(`
    UPDATE projects SET final_report = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(body.final_report, projectId);

  return c.json({ success: true, data: { final_report: body.final_report } });
});

// Synthesize final report from approved search reports
app.post('/synthesize', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;
  const userRequest = body.user_request as string | undefined;

  const db = getDb();

  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ?
  `).get(projectId) as { id: string; model_text: string; corpus_synopsis: string | null } | undefined;

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Get reports that passed evaluation
  const reports = db.prepare(`
    SELECT sr.*, sp.plan_name, sp.main_objective
    FROM search_reports sr
    JOIN search_plans sp ON sr.search_plan_id = sp.id
    WHERE sr.project_id = ? AND sr.passed_evaluation = 1
    ORDER BY sr.created_at
  `).all(projectId) as Array<SearchReport & { plan_name: string; main_objective: string }>;

  if (reports.length === 0) {
    return c.json({ success: false, error: 'No approved reports to synthesize. Evaluate reports first.' }, 400);
  }

  // Format reports for synthesis
  const formattedReports = reports.map((r, i) => `
### Search Result ${i + 1}: ${r.main_objective}

${r.report_contents}
`).join('\n\n---\n\n');

  const userContext = userRequest
    ? `USER REQUEST: ${userRequest}\n\n`
    : project.corpus_synopsis
      ? `CORPUS CONTEXT: ${project.corpus_synopsis}\n\n`
      : '';

  const fullPrompt = `${userContext}SEARCH RESULTS:\n\n${formattedReports}`;

  // Call LLM for synthesis
  const response = await llmClient.chat([
    { role: 'system', content: prompts.synthesize },
    { role: 'user', content: fullPrompt },
  ], model ?? project.model_text);

  const finalReport = response.choices[0].message.content || '';

  // Save final report
  db.prepare(`
    UPDATE projects SET final_report = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(finalReport, projectId);

  return c.json({ success: true, data: { final_report: finalReport } });
});

// Evaluate reports
app.post('/evaluate', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;

  const db = getDb();

  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ?
  `).get(projectId) as { id: string; model_text: string } | undefined;

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Get unevaluated reports
  const reports = db.prepare(`
    SELECT sr.*, sp.content as plan_content
    FROM search_reports sr
    JOIN search_plans sp ON sr.search_plan_id = sp.id
    WHERE sr.project_id = ? AND sr.evaluation_metadata IS NULL
  `).all(projectId) as Array<SearchReport & { plan_content: string }>;

  if (reports.length === 0) {
    return c.json({ success: false, error: 'No reports to evaluate' }, 400);
  }

  const results: Array<{
    report_id: string;
    passed: boolean;
    relevance: { passed: boolean; reason: string };
    thoroughness: { passed: boolean; reason: string };
  }> = [];

  for (const report of reports) {
    // Evaluate using LLM
    const evaluationPrompt = `
SEARCH PLAN:
${report.plan_content}

REPORT:
${report.report_contents}
`;

    const response = await llmClient.chat([
      { role: 'system', content: prompts.evaluate },
      { role: 'user', content: evaluationPrompt },
    ], model ?? project.model_text);

    const evalContent = response.choices[0].message.content || '';

    // Parse evaluation response
    const relevanceMatch = evalContent.match(/RELEVANCE:\s*(YES|NO)/i);
    const relevanceReasonMatch = evalContent.match(/RELEVANCE:.*?Reason:\s*(.+?)(?=THOROUGHNESS|$)/is);
    const thoroughnessMatch = evalContent.match(/THOROUGHNESS:\s*(YES|NO)/i);
    const thoroughnessReasonMatch = evalContent.match(/THOROUGHNESS:.*?Reason:\s*(.+?)$/is);

    const relevance = {
      passed: relevanceMatch?.[1]?.toUpperCase() === 'YES',
      reason: relevanceReasonMatch?.[1]?.trim() || 'Unable to parse reason',
    };

    const thoroughness = {
      passed: thoroughnessMatch?.[1]?.toUpperCase() === 'YES',
      reason: thoroughnessReasonMatch?.[1]?.trim() || 'Unable to parse reason',
    };

    const passed = relevance.passed && thoroughness.passed;

    // Update report
    db.prepare(`
      UPDATE search_reports
      SET passed_evaluation = ?, evaluation_metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(passed ? 1 : 0, JSON.stringify({ relevance, thoroughness }), report.id);

    results.push({
      report_id: report.id,
      passed,
      relevance,
      thoroughness,
    });
  }

  return c.json({ success: true, data: results });
});

export default app;
