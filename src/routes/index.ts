import { Hono } from 'hono';
import health from './health.js';
import models from './models.js';
import projects from './projects.js';
import documents from './documents.js';
import search from './search.js';
import corpus from './corpus.js';
import plans from './plans.js';
import reports from './reports.js';
import final from './final.js';

const app = new Hono();

// Top-level routes
app.route('/health', health);
app.route('/models', models);

// Project routes
app.route('/projects', projects);

// Nested project routes
app.route('/projects/:id/documents', documents);
app.route('/projects/:id/search', search);
app.route('/projects/:id/corpus', corpus);
app.route('/projects/:id/plans', plans);
app.route('/projects/:id/reports', reports);
app.route('/projects/:id/final', final);

export default app;
