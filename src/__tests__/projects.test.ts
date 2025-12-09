import { describe, it, expect, beforeEach } from 'vitest';
import { testRequest, createTestProject } from './helpers';

describe('Projects Endpoints', () => {
  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const response = await testRequest
        .post('/api/projects')
        .send({ project_name: 'Test Project' })
        .expect(201);

      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('project_name', 'Test Project');
      expect(response.body.data).toHaveProperty('created_at');
    });

    it('should reject request without name', async () => {
      await testRequest
        .post('/api/projects')
        .send({})
        .expect(400);
    });

    it('should accept optional fields', async () => {
      const response = await testRequest
        .post('/api/projects')
        .send({
          project_name: 'Project with Models',
          model_text: 'gpt-4',
          model_embedding: 'gpt-3.5-turbo',
        })
        .expect(201);

      expect(response.body.data.model_text).toBe('gpt-4');
      expect(response.body.data.model_embedding).toBe('gpt-3.5-turbo');

    });
  });

  describe('GET /api/projects', () => {
    it('should return empty array when no projects exist', async () => {
      const response = await testRequest
        .get('/api/projects')
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return all projects', async () => {
      await createTestProject('Project 1');
      await createTestProject('Project 2');

      const response = await testRequest
        .get('/api/projects')
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0]).toHaveProperty('project_name');
      expect(response.body.data[0]).toHaveProperty('document_count');
      expect(response.body.data[0]).toHaveProperty('chunk_count');
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return project by id', async () => {
      const project = await createTestProject('Test Project');

      const response = await testRequest
        .get(`/api/projects/${project.id}`)
        .expect(200);

      expect(response.body.data.id).toBe(project.id);
      expect(response.body.data.project_name).toBe('Test Project');
      expect(response.body.data).toHaveProperty('document_count');
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .get('/api/projects/nonexistent-id')
        .expect(404);
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('should update project name', async () => {
      const project = await createTestProject('Original Name');

      const response = await testRequest
        .patch(`/api/projects/${project.id}`)
        .send({ project_name: 'Updated Name' })
        .expect(200);

      expect(response.body.data.project_name).toBe('Updated Name');
    });

    it('should update model settings', async () => {
      const project = await createTestProject('Test Project');

      const response = await testRequest
        .patch(`/api/projects/${project.id}`)
        .send({
          model_text: 'gpt-4',
        })
        .expect(200);

      expect(response.body.data.model_text).toBe('gpt-4');
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .patch('/api/projects/nonexistent-id')
        .send({ project_name: 'New Name' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete project', async () => {
      const project = await createTestProject('To Delete');

      await testRequest
        .delete(`/api/projects/${project.id}`)
        .expect(204);

      await testRequest
        .get(`/api/projects/${project.id}`)
        .expect(404);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .delete('/api/projects/nonexistent-id')
        .expect(404);
    });
  });
});
