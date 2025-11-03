import { writable } from 'svelte/store';

// Global application state
export const currentStep = writable(0);
export const loading = writable(false);
export const error = writable(null);
export const selectedLLM = writable('qwen/qwen3-14b');
export const corpusName = writable('');
export const isResuming = writable(false);
export const resumeStages = writable({
  description: false,
  plans: false,
  reports: false,
  final: false
});
export const projectSelected = writable(false);
export const currentProject = writable(null);

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
export const reportEvaluations = writable(null);

// Navigation
export const steps = [
  { id: 0, title: 'Upload Documents', description: 'Upload PDF documents for processing' },
  { id: 1, title: 'Document Description', description: 'Generate and edit document corpus description' },
  { id: 2, title: 'Search Plans', description: 'Generate comprehensive search plans for corpus analysis' },
  { id: 3, title: 'Execute Search', description: 'Run search agents and view tool calls' },
  { id: 4, title: 'Review Reports', description: 'View and edit generated reports' },
  { id: 5, title: 'Final Report', description: 'Generate and edit final synthesized report' }
];

export const STEP_STATUS = {
  NOT_STARTED: 'not-started',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  NEEDS_UPDATE: 'needs-update'
};

export const stepStatuses = writable(steps.map(() => STEP_STATUS.NOT_STARTED));

// Helper functions
export function setError(message) {
  error.set(message);
  setTimeout(() => error.set(null), 5000);
}

export function setLoading(isLoading) {
  loading.set(isLoading);
}