import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { llmClient } from '../services/llm-client.js';
import { sampleText, countTokens } from '../services/chunker.js';
import { prompts } from '../services/prompts.js';
import type { Document } from '../types/index.js';

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

const sampleOptionsSchema = z.object({
  tokens_per_doc: z.number().int().min(50).max(500).optional().default(100),
  max_total_tokens: z.number().int().min(1000).max(50000).optional().default(10000),
});

// Sample tokens from documents
app.post('/sample', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const options = sampleOptionsSchema.parse(body);

  const db = getDb();

  // Get embedded documents
  const documents = db.prepare(`
    SELECT * FROM documents
    WHERE project_id = ? AND status = 'embedded' AND content IS NOT NULL
    ORDER BY filename
  `).all(projectId) as Document[];

  if (documents.length === 0) {
    return c.json({ success: false, error: 'No embedded documents found' }, 400);
  }

  // Sample from each document
  const samples: Array<{ filename: string; sample: string; tokens: number }> = [];
  let totalTokens = 0;

  for (const doc of documents) {
    if (totalTokens >= options.max_total_tokens) break;

    const remainingBudget = options.max_total_tokens - totalTokens;
    const tokensToSample = Math.min(options.tokens_per_doc, remainingBudget);

    const sample = sampleText(doc.content!, tokensToSample);
    const sampleTokens = countTokens(sample);

    samples.push({
      filename: doc.filename,
      sample,
      tokens: sampleTokens,
    });

    totalTokens += sampleTokens;
  }

  // Format for LLM
  const formattedSamples = samples.map(s =>
    `=== ${s.filename} ===\n${s.sample}`
  ).join('\n\n');

  return c.json({
    success: true,
    data: {
      document_count: samples.length,
      total_tokens: totalTokens,
      samples: formattedSamples,
    },
  });
});

// Generate corpus synopsis (non-streaming)
app.post('/compress', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;

  const db = getDb();

  // Check project exists
  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as { id: string; model_text: string } | undefined;
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Get samples
  const documents = db.prepare(`
    SELECT * FROM documents
    WHERE project_id = ? AND status = 'embedded' AND content IS NOT NULL
    ORDER BY filename
  `).all(projectId) as Document[];

  if (documents.length === 0) {
    return c.json({ success: false, error: 'No embedded documents found' }, 400);
  }

  // Sample documents
  const samples = documents.map(doc => {
    const sample = sampleText(doc.content!, 100);
    return `=== ${doc.filename} ===\n${sample}`;
  }).join('\n\n');

  // Call LLM
  const response = await llmClient.chat([
    { role: 'system', content: prompts.compress },
    { role: 'user', content: samples },
  ], model ?? project.model_text);

  const synopsis = response.choices[0].message.content || '';

  // Save to project
  db.prepare(`
    UPDATE projects SET corpus_synopsis = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(synopsis, projectId);

  return c.json({ success: true, data: { synopsis } });
});

// Generate corpus synopsis (streaming)
app.post('/compress/stream', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json().catch(() => ({}));
  const model = body.model as string | undefined;

  const db = getDb();

  const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as { id: string; model_text: string } | undefined;
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const documents = db.prepare(`
    SELECT * FROM documents
    WHERE project_id = ? AND status = 'embedded' AND content IS NOT NULL
    ORDER BY filename
  `).all(projectId) as Document[];

  if (documents.length === 0) {
    return c.json({ success: false, error: 'No embedded documents found' }, 400);
  }

  const samples = documents.map(doc => {
    const sample = sampleText(doc.content!, 100);
    return `=== ${doc.filename} ===\n${sample}`;
  }).join('\n\n');

  return streamSSE(c, async (stream) => {
    let fullContent = '';

    try {
      for await (const chunk of llmClient.chatStream([
        { role: 'system', content: prompts.compress },
        { role: 'user', content: samples },
      ], model ?? project.model_text)) {
        fullContent += chunk;
        await stream.writeSSE({ data: chunk });
      }

      // Save the complete result
      db.prepare(`
        UPDATE projects SET corpus_synopsis = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(fullContent, projectId);

      await stream.writeSSE({ data: '[DONE]' });
    } catch (error) {
      await stream.writeSSE({ data: `[ERROR] ${error}` });
    }
  });
});

// Get corpus synopsis
app.get('/synopsis', (c) => {
  const projectId = c.get('projectId');
  const db = getDb();

  const project = db.prepare(`
    SELECT corpus_synopsis FROM projects WHERE id = ?
  `).get(projectId) as { corpus_synopsis: string | null } | undefined;

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  return c.json({ success: true, data: { synopsis: project.corpus_synopsis } });
});

// Update corpus synopsis
app.put('/synopsis', async (c) => {
  const projectId = c.get('projectId');
  const body = await c.req.json();

  if (!body.synopsis || typeof body.synopsis !== 'string') {
    return c.json({ success: false, error: 'Synopsis is required' }, 400);
  }

  const db = getDb();

  const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId);
  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  db.prepare(`
    UPDATE projects SET corpus_synopsis = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(body.synopsis, projectId);

  return c.json({ success: true, data: { synopsis: body.synopsis } });
});

export default app;
