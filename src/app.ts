import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import routes from './routes/index.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    success: false,
    error: err.message || 'Internal server error',
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: 'Not found',
  }, 404);
});

// Mount API routes
app.route('/api', routes);

// Root redirect
app.get('/', (c) => {
  return c.json({
    name: 'Semantic Search Assistant API',
    version: '0.1.0',
    docs: '/api/health',
  });
});

export default app;
