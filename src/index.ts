import { serve } from '@hono/node-server';
import app from './app.js';
import { config } from './config/index.js';
import { getDb, closeDb } from './db/client.js';
import { embeddingService } from './services/embeddings.js';

async function main() {
  console.log('Starting Semantic Search Assistant API...');

  // Initialize database
  console.log('Initializing database...');
  getDb();
  console.log(`Database ready at: ${config.DATABASE_PATH}`);

  // Optionally pre-warm embedding model (comment out for faster cold starts)
  // console.log('Loading embedding model...');
  // await embeddingService.initialize();
  // console.log('Embedding model ready');

  // Start server
  const server = serve({
    fetch: app.fetch,
    port: config.PORT,
    hostname: config.HOST,
  });

  console.log(`Server running at http://${config.HOST}:${config.PORT}`);
  console.log(`API documentation: http://${config.HOST}:${config.PORT}/api/health`);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down...');
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
