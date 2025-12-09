import { describe, it, expect, beforeEach } from 'vitest';
import { testRequest, createTestProject } from './helpers';
import { getDb } from '../db/client';

describe('Search Plans Endpoints', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject('Test Project');
    projectId = project.id;
  });

  describe('GET /api/projects/:id/plans', () => {
    it('should return empty array when no plans exist', async () => {
      const response = await testRequest
        .get(`/api/projects/${projectId}/plans`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .get('/api/projects/nonexistent/plans')
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/plans/generate', () => {

    // ...

    it('should generate search plans', async () => {
      // Inject synopsis
      const db = getDb();
      db.prepare(`UPDATE projects SET corpus_synopsis = ? WHERE id = ?`)
        .run('Test Synopsis', projectId);

      const response = await testRequest
        .post(`/api/projects/${projectId}/plans/generate`)
        .send({ numPlans: 3 })
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should use default numPlans if not provided', async () => {
      // Inject synopsis
      const db = getDb();
      db.prepare(`UPDATE projects SET corpus_synopsis = ? WHERE id = ?`)
        .run('Test Synopsis', projectId);

      const response = await testRequest
        .post(`/api/projects/${projectId}/plans/generate`)
        .send({})
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/plans/generate')
        .send({ numPlans: 3 })
        .expect(404);
    });
  });

  describe('GET /api/projects/:id/plans/:planId', () => {
    it('should return 404 for non-existent plan', async () => {
      await testRequest
        .get(`/api/projects/${projectId}/plans/nonexistent`)
        .expect(404);
    });
  });

  describe('PATCH /api/projects/:id/plans/:planId', () => {
    it('should return 404 for non-existent plan', async () => {
      await testRequest
        .patch(`/api/projects/${projectId}/plans/nonexistent`)
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id/plans/:planId', () => {
    it('should return 404 for non-existent plan', async () => {
      await testRequest
        .delete(`/api/projects/${projectId}/plans/nonexistent`)
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/plans/:planId/execute', () => {
    it('should return 404 for non-existent plan', async () => {
      await testRequest
        .post(`/api/projects/${projectId}/plans/nonexistent/execute`)
        .expect(404);
    });
  });
});
