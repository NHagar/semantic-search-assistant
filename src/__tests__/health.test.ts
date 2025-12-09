import { describe, it, expect } from 'vitest';
import { testRequest } from './helpers';

describe('Health Endpoint', () => {
  describe('GET /api/health', () => {
    it('should return 200 status', async () => {
      const response = await testRequest
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('database', 'connected');
    });

    it('should indicate database connection status', async () => {
      const response = await testRequest
        .get('/api/health')
        .expect(200);

      expect(response.body.database).toBe('connected');
    });
  });
});
