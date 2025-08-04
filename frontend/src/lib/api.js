import axios from 'axios';

const API_BASE_URL = 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Health check
  async healthCheck() {
    const response = await api.get('/health');
    return response.data;
  },

  // Document management
  async uploadFiles(files) {
    const formData = new FormData();
    for (let file of files) {
      formData.append('files', file);
    }
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async processDocuments(options = {}) {
    const response = await api.post('/process-documents', options);
    return response.data;
  },

  // Document description
  async compressDocuments(documents = null) {
    const response = await api.post('/compress-documents', { documents });
    return response.data;
  },

  async getDescription() {
    const response = await api.get('/get-description');
    return response.data;
  },

  async updateDescription(description) {
    const response = await api.post('/update-description', { description });
    return response.data;
  },

  // Search plans
  async generateSearchPlans(userQuery) {
    const response = await api.post('/generate-search-plans', { user_query: userQuery });
    return response.data;
  },

  async getSearchPlans() {
    const response = await api.get('/get-search-plans');
    return response.data;
  },

  async updateSearchPlan(planId, content) {
    const response = await api.post('/update-search-plan', { plan_id: planId, content });
    return response.data;
  },

  // Search execution
  async executeSearchPlans(options = {}) {
    const response = await api.post('/execute-search-plans', options);
    return response.data;
  },

  // Reports
  async getReports() {
    const response = await api.get('/get-reports');
    return response.data;
  },

  async updateReport(reportId, content) {
    const response = await api.post('/update-report', { report_id: reportId, content });
    return response.data;
  },

  // Final report
  async synthesizeFinalReport(userQuery) {
    const response = await api.post('/synthesize-final-report', { user_query: userQuery });
    return response.data;
  },

  async getFinalReport() {
    const response = await api.get('/get-final-report');
    return response.data;
  },

  async updateFinalReport(content) {
    const response = await api.post('/update-final-report', { content });
    return response.data;
  },

  // Database stats
  async getDatabaseStats() {
    const response = await api.get('/database-stats');
    return response.data;
  },
};