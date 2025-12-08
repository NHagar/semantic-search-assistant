import { Hono } from 'hono';
import { llmClient } from '../services/llm-client.js';

const app = new Hono();

app.get('/', async (c) => {
  const models = await llmClient.getAvailableModels();

  return c.json({
    success: true,
    data: models,
  });
});

export default app;
