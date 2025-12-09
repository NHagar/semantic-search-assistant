import request from 'supertest';
import { createAdaptorServer } from '@hono/node-server';
import { createTestApp } from './test-app.js';

const app = createTestApp();
export const testRequest = request(createAdaptorServer(app));

export const createTestProject = async (name = 'Test Project') => {
  const response = await testRequest
    .post('/api/projects')
    .send({ project_name: name })
    .expect(201);

  return response.body.data;
};

export const createTestDocument = async (projectId: string, title = 'Test Document', content = 'Test content') => {
  const response = await testRequest
    .post(`/api/projects/${projectId}/documents/upload`)
    .field('title', title)
    .attach('files', Buffer.from(content), 'test.pdf')
    .expect(201);

  return response.body.documents[0];
};
