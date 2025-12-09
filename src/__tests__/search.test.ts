import { describe, it, expect, beforeEach } from 'vitest';
import { testRequest, createTestProject } from './helpers';

describe('Search Endpoints', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject('Test Project');
    projectId = project.id;
  });

  describe('POST /api/projects/:id/search', () => {
    it('should accept search request', async () => {
      const response = await testRequest
        .post(`/api/projects/${projectId}/search`)
        .send({ query: 'test query' })
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should accept optional parameters', async () => {
      const response = await testRequest
        .post(`/api/projects/${projectId}/search`)
        .send({
          query: 'test query',
          k: 5,
          minScore: 0.7,
        })
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should reject request without query', async () => {
      await testRequest
        .post(`/api/projects/${projectId}/search`)
        .send({})
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/search')
        .send({ query: 'test' })
        .expect(404);
    });
  });

  describe('GET /api/projects/:id/search/citation/:key', () => {
    it('should return 404 for non-existent citation', async () => {
      await testRequest
        .get(`/api/projects/${projectId}/search/citation/nonexistent`)
        .expect(404);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .get('/api/projects/nonexistent/search/citation/test')
        .expect(404);
    });
  });
});
