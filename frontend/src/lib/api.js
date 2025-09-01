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

  async extractDocuments(llm = null, corpusName = null) {
    const requestData = {};
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/extract-documents', requestData);
    return response.data;
  },

  async sampleDocuments(options = {}, llm = null, corpusName = null) {
    const requestData = { ...options };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/sample-documents', requestData);
    return response.data;
  },

  async processDocuments(options = {}, llm = null, corpusName = null) {
    const requestData = { ...options };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/process-documents', requestData);
    return response.data;
  },

  // Document description
  async compressDocuments(documents = null, llm = null, corpusName = null) {
    const requestData = { documents };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/compress-documents', requestData);
    return response.data;
  },

  async getDescription(llm = null, corpusName = null) {
    const params = new URLSearchParams();
    if (llm) params.append('llm', llm);
    if (corpusName) params.append('corpus_name', corpusName);
    const response = await api.get(`/get-description?${params.toString()}`);
    return response.data;
  },

  async updateDescription(description, llm = null, corpusName = null) {
    const requestData = { description };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/update-description', requestData);
    return response.data;
  },

  // Search plans
  async generateSearchPlans(llm = null, corpusName = null) {
    const requestData = {};
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/generate-search-plans', requestData);
    return response.data;
  },

  async getSearchPlans(llm = null, corpusName = null) {
    const params = new URLSearchParams();
    if (llm) params.append('llm', llm);
    if (corpusName) params.append('corpus_name', corpusName);
    const response = await api.get(`/get-search-plans?${params.toString()}`);
    return response.data;
  },

  async updateSearchPlan(planId, content, llm = null, corpusName = null) {
    const requestData = { plan_id: planId, content };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/update-search-plan', requestData);
    return response.data;
  },

  // Search execution
  async executeSearchPlans(options = {}, llm = null, corpusName = null) {
    const requestData = { ...options };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/execute-search-plans', requestData);
    return response.data;
  },

  // Reports
  async getReports(llm = null, corpusName = null) {
    const params = new URLSearchParams();
    if (llm) params.append('llm', llm);
    if (corpusName) params.append('corpus_name', corpusName);
    const response = await api.get(`/get-reports?${params.toString()}`);
    return response.data;
  },

  async updateReport(reportId, content, llm = null, corpusName = null) {
    const requestData = { report_id: reportId, content };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/update-report', requestData);
    return response.data;
  },

  // Final report
  async synthesizeFinalReport(userQuery, llm = null, corpusName = null) {
    const requestData = { user_query: userQuery };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/synthesize-final-report', requestData);
    return response.data;
  },

  async getFinalReport(llm = null, corpusName = null) {
    const params = new URLSearchParams();
    if (llm) params.append('llm', llm);
    if (corpusName) params.append('corpus_name', corpusName);
    const response = await api.get(`/get-final-report?${params.toString()}`);
    return response.data;
  },

  async updateFinalReport(content, llm = null, corpusName = null) {
    const requestData = { content };
    if (llm) requestData.llm = llm;
    if (corpusName) requestData.corpus_name = corpusName;
    const response = await api.post('/update-final-report', requestData);
    return response.data;
  },

  // Database stats
  async getDatabaseStats(llm = null, corpusName = null) {
    const params = new URLSearchParams();
    if (llm) params.append('llm', llm);
    if (corpusName) params.append('corpus_name', corpusName);
    const response = await api.get(`/database-stats?${params.toString()}`);
    return response.data;
  },

  // Existing combinations
  async getExistingCombinations() {
    const response = await api.get('/existing-combinations');
    return response.data;
  },
};