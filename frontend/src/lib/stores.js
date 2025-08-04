import { writable } from 'svelte/store';

// Global application state
export const currentStep = writable(0);
export const userQuery = writable('');
export const loading = writable(false);
export const error = writable(null);

// Document state
export const uploadedFiles = writable([]);
export const processedDocuments = writable('');
export const documentDescription = writable('');

// Search plans state
export const searchPlans = writable([]);
export const searchPlansGenerated = writable(false);

// Reports state
export const reports = writable([]);
export const reportsGenerated = writable(false);

// Final report state
export const finalReport = writable('');
export const finalReportGenerated = writable(false);

// Navigation
export const steps = [
  { id: 0, title: 'Upload Documents', description: 'Upload PDF documents for processing' },
  { id: 1, title: 'Document Description', description: 'Generate and edit document corpus description' },
  { id: 2, title: 'Search Plans', description: 'Generate and edit search plans' },
  { id: 3, title: 'Execute Search', description: 'Run search agents and view tool calls' },
  { id: 4, title: 'Review Reports', description: 'View and edit generated reports' },
  { id: 5, title: 'Final Report', description: 'Generate and edit final synthesized report' }
];

// Helper functions
export function setError(message) {
  error.set(message);
  setTimeout(() => error.set(null), 5000);
}

export function setLoading(isLoading) {
  loading.set(isLoading);
}