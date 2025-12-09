import { describe, it, expect, beforeEach } from 'vitest';
import { testRequest, createTestProject } from './helpers';

describe('Corpus Endpoints', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject('Test Project');
    projectId = project.id;
  });

  describe('POST /api/projects/:id/corpus/sample', () => {
    it('should sample tokens from corpus', async () => {
      const response = await testRequest
        .post(`/api/projects/${projectId}/corpus/sample`)
        .send({ targetTokens: 1000 })
        .expect(200);

      expect(response.body.data).toHaveProperty('samples');
      expect(response.body.data).toHaveProperty('total_tokens');
    });

    it('should reject request without targetTokens', async () => {
      await testRequest
        .post(`/api/projects/${projectId}/corpus/sample`)
        .send({})
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/corpus/sample')
        .send({ targetTokens: 1000 })
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/corpus/compress', () => {
    it('should generate corpus synopsis', async () => {
      const response = await testRequest
        .post(`/api/projects/${projectId}/corpus/compress`)
        .send({ maxTokens: 1000 })
        .expect(200);

      expect(response.body.data).toHaveProperty('synopsis');
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/corpus/compress')
        .send({ maxTokens: 1000 })
        .expect(404);
    });
  });

  describe('GET /api/projects/:id/corpus/synopsis', () => {
    it('should return null when no synopsis exists', async () => {
      const response = await testRequest
        .get(`/api/projects/${projectId}/corpus/synopsis`)
        .expect(200);

      expect(response.body.data).toHaveProperty('synopsis', null);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .get('/api/projects/nonexistent/corpus/synopsis')
        .expect(404);
    });
  });

  describe('PUT /api/projects/:id/corpus/synopsis', () => {
    it('should update corpus synopsis', async () => {
      const response = await testRequest
        .put(`/api/projects/${projectId}/corpus/synopsis`)
        .send({ synopsis: 'Updated synopsis' })
        .expect(200);

      expect(response.body.data).toHaveProperty('synopsis', 'Updated synopsis');
    });

    it('should reject request without synopsis', async () => {
      await testRequest
        .put(`/api/projects/${projectId}/corpus/synopsis`)
        .send({})
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .put('/api/projects/nonexistent/corpus/synopsis')
        .send({ synopsis: 'test' })
        .expect(404);
    });
  });
});
