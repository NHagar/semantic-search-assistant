import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testRequest, createTestProject } from './helpers';

describe('Documents Endpoints', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject('Test Project');
    projectId = project.id;
  });

  describe('GET /api/projects/:id/documents', () => {
    it('should return empty array when no documents exist', async () => {
      const response = await testRequest
        .get(`/api/projects/${projectId}/documents`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should filter documents by status', async () => {
      const response = await testRequest
        .get(`/api/projects/${projectId}/documents?status=uploaded`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .get('/api/projects/nonexistent/documents')
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/documents/upload', () => {
    it('should upload PDF files', async () => {
      const pdfBuffer = Buffer.from('fake pdf content');

      const response = await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', pdfBuffer, 'test.pdf')
        .expect(201);

      expect(response.body.data).toHaveProperty('uploaded');
      expect(Array.isArray(response.body.data.uploaded)).toBe(true);
      expect(response.body.data.uploaded[0]).toHaveProperty('id');
      expect(response.body.data.uploaded[0]).toHaveProperty('filename');
      // Status is 'pending' initially until extracted
      expect(response.body.data.uploaded[0]).toHaveProperty('status', 'pending');
    });

    it('should handle multiple file uploads', async () => {
      const pdf1 = Buffer.from('fake pdf 1');
      const pdf2 = Buffer.from('fake pdf 2');

      const response = await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', pdf1, 'test1.pdf')
        .attach('files', pdf2, 'test2.pdf')
        .expect(201);

      expect(response.body.data.uploaded.length).toBe(2);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/documents/upload')
        .attach('files', Buffer.from('test'), 'test.pdf')
        .expect(404);
    });
  });

  describe('GET /api/projects/:id/documents/:docId', () => {
    it('should return document by id', async () => {
      const uploadResponse = await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', Buffer.from('test'), 'test.pdf')
        .expect(201);

      const docId = uploadResponse.body.data.uploaded[0].id;

      const response = await testRequest
        .get(`/api/projects/${projectId}/documents/${docId}`)
        .expect(200);

      expect(response.body.data.id).toBe(docId);
      expect(response.body.data).toHaveProperty('filename');
      expect(response.body.data).toHaveProperty('status');
    });

    it('should return 404 for non-existent document', async () => {
      await testRequest
        .get(`/api/projects/${projectId}/documents/nonexistent`)
        .expect(404);
    });
  });

  describe('PATCH /api/projects/:id/documents/:docId', () => {
    it('should update document content', async () => {
      const uploadResponse = await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', Buffer.from('test'), 'test.pdf')
        .expect(201);

      const docId = uploadResponse.body.data.uploaded[0].id;

      const response = await testRequest
        .patch(`/api/projects/${projectId}/documents/${docId}`)
        .send({ content: 'Updated content' })
        .expect(200);

      expect(response.body.data.content).toBe('Updated content');
    });

    it('should return 404 for non-existent document', async () => {
      await testRequest
        .patch(`/api/projects/${projectId}/documents/nonexistent`)
        .send({ content: 'test' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:id/documents/:docId', () => {
    it('should delete document', async () => {
      const uploadResponse = await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', Buffer.from('test'), 'test.pdf')
        .expect(201);

      const docId = uploadResponse.body.data.uploaded[0].id;

      await testRequest
        .delete(`/api/projects/${projectId}/documents/${docId}`)
        .expect(204);

      await testRequest
        .get(`/api/projects/${projectId}/documents/${docId}`)
        .expect(404);
    });

    it('should return 404 for non-existent document', async () => {
      await testRequest
        .delete(`/api/projects/${projectId}/documents/nonexistent`)
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/documents/extract', () => {
    it('should return 200 status', async () => {
      await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', Buffer.from('test'), 'test.pdf')
        .expect(201);

      await testRequest
        .post(`/api/projects/${projectId}/documents/extract`)
        .expect(200);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/documents/extract')
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/documents/embed', () => {
    it('should return 200 status', async () => {
      await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', Buffer.from('test'), 'test.pdf')
        .expect(201);

      await testRequest
        .post(`/api/projects/${projectId}/documents/embed`)
        .expect(200);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/documents/embed')
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/documents/:docId/reembed', () => {
    it('should re-embed document', async () => {
      const uploadResponse = await testRequest
        .post(`/api/projects/${projectId}/documents/upload`)
        .attach('files', Buffer.from('test'), 'test.pdf')
        .expect(201);

      const docId = uploadResponse.body.data.uploaded[0].id;

      await testRequest
        .post(`/api/projects/${projectId}/documents/${docId}/reembed`)
        .expect(200);
    });

    it('should return 404 for non-existent document', async () => {
      await testRequest
        .post(`/api/projects/${projectId}/documents/nonexistent/reembed`)
        .expect(404);
    });
  });
});
