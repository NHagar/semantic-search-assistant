import { describe, it, expect } from 'vitest';
import { testRequest } from './helpers';

describe('Models Endpoint', () => {
  describe('GET /api/models', () => {
    it('should return 200 status', async () => {
      await testRequest
        .get('/api/models')
        .expect(200);
    });

    it('should return array of models', async () => {
      const response = await testRequest
        .get('/api/models')
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should include model properties', async () => {
      const response = await testRequest
        .get('/api/models')
        .expect(200);

      const models = response.body.data;
      if (models.length > 0) {
        const model = models[0];
        expect(typeof model).toBe('string');
      }
    });
  });
});
