import { describe, it, expect, beforeEach } from 'vitest';
import { testRequest, createTestProject } from './helpers';
import { getDb } from '../db/client';
import { generateId } from '../utils/id';

describe('Search Reports Endpoints', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject('Test Project');
    projectId = project.id;
  });

  describe('GET /api/projects/:id/reports', () => {
    it('should return empty array when no reports exist', async () => {
      const response = await testRequest
        .get(`/api/projects/${projectId}/reports`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .get('/api/projects/nonexistent/reports')
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/reports/execute', () => {

    // ...

    it('should execute selected plans', async () => {
      // Manually insert a selected search plan
      const db = getDb();
      const planId = generateId('plan');
      db.prepare(`
        INSERT INTO search_plans (id, project_id, plan_name, main_objective, content, is_selected)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(planId, projectId, 'Test Plan', 'Test Objective', 'Test Content', 1);

      const response = await testRequest
        .post(`/api/projects/${projectId}/reports/execute`)
        .expect(200);

      expect(response.body.data).toHaveProperty('results');
      expect(Array.isArray(response.body.data.results)).toBe(true);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/reports/execute')
        .expect(404);
    });
  });

  describe('GET /api/projects/:id/reports/:reportId', () => {
    it('should return 404 for non-existent report', async () => {
      await testRequest
        .get(`/api/projects/${projectId}/reports/nonexistent`)
        .expect(404);
    });
  });

  describe('PATCH /api/projects/:id/reports/:reportId', () => {
    it('should return 404 for non-existent report', async () => {
      await testRequest
        .patch(`/api/projects/${projectId}/reports/nonexistent`)
        .send({ contents: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id/reports/:reportId', () => {
    it('should return 404 for non-existent report', async () => {
      await testRequest
        .delete(`/api/projects/${projectId}/reports/nonexistent`)
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/reports/:reportId/regenerate', () => {
    it('should return 404 for non-existent report', async () => {
      await testRequest
        .post(`/api/projects/${projectId}/reports/nonexistent/regenerate`)
        .expect(404);
    });
  });
});
