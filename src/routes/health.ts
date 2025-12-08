import { Hono } from 'hono';
import { getDb } from '../db/client.js';

const app = new Hono();

app.get('/', (c) => {
  try {
    const db = getDb();
    // Simple query to check database connection
    db.prepare('SELECT 1').get();

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    return c.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: String(error),
    }, 500);
  }
});

export default app;
