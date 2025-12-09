import { describe, it, expect, beforeEach } from 'vitest';
import { testRequest, createTestProject } from './helpers';
import { getDb } from '../db/client';
import { generateId } from '../utils/id';

describe('Final Report Endpoints', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject('Test Project');
    projectId = project.id;
  });

  describe('GET /api/projects/:id/final', () => {
    it('should return null when no final report exists', async () => {
      const response = await testRequest
        .get(`/api/projects/${projectId}/final`)
        .expect(200);

      expect(response.body.data).toHaveProperty('final_report', null);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .get('/api/projects/nonexistent/final')
        .expect(404);
    });
  });

  describe('PUT /api/projects/:id/final', () => {
    it('should update final report', async () => {
      const response = await testRequest
        .put(`/api/projects/${projectId}/final`)
        .send({ final_report: 'Final report content' })
        .expect(200);

      expect(response.body.data).toHaveProperty('final_report', 'Final report content');
    });

    it('should reject request without finalReport', async () => {
      await testRequest
        .put(`/api/projects/${projectId}/final`)
        .send({})
        .expect(400);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .put('/api/projects/nonexistent/final')
        .send({ final_report: 'test' })
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/final/synthesize', () => {
    it('should synthesize final report', async () => {
      // Insert approved report
      const db = getDb();
      const planId = generateId('plan');
      db.prepare(`INSERT INTO search_plans (id, project_id, plan_name, main_objective, content, is_selected) VALUES (?, ?, 'Plan', 'Obj', 'Content', 1)`).run(planId, projectId);

      const reportId = generateId('rpt');
      db.prepare(`INSERT INTO search_reports (id, project_id, search_plan_id, report_contents, passed_evaluation) VALUES (?, ?, ?, 'Report Content', 1)`).run(reportId, projectId, planId);

      const response = await testRequest
        .post(`/api/projects/${projectId}/final/synthesize`)
        .expect(200);

      expect(response.body.data).toHaveProperty('final_report');
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/final/synthesize')
        .expect(404);
    });
  });

  describe('POST /api/projects/:id/final/evaluate', () => {
    it('should evaluate reports', async () => {
      // Insert unevaluated report
      const db = getDb();
      const planId = generateId('plan');
      const planContent = 'Plan Content';
      db.prepare(`INSERT INTO search_plans (id, project_id, plan_name, main_objective, content, is_selected) VALUES (?, ?, 'Plan', 'Obj', ?, 1)`).run(planId, projectId, planContent);

      const reportId = generateId('rpt');
      db.prepare(`INSERT INTO search_reports (id, project_id, search_plan_id, report_contents, evaluation_metadata) VALUES (?, ?, ?, 'Report Content', NULL)`).run(reportId, projectId, planId);

      const response = await testRequest
        .post(`/api/projects/${projectId}/final/evaluate`)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 404 for non-existent project', async () => {
      await testRequest
        .post('/api/projects/nonexistent/final/evaluate')
        .expect(404);
    });
  });
});
