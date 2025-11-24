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
  reports: false
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
export const selectedPlanIds = writable(new Set());

// Reports state
export const reports = writable([]);
export const reportsGenerated = writable(false);
export const reportEvaluations = writable(null);


// Helper functions
export function setError(message) {
  error.set(message);
  setTimeout(() => error.set(null), 5000);
}

export function setLoading(isLoading) {
  loading.set(isLoading);
}