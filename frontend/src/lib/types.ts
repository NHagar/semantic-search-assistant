export interface Project {
    id: string;
    name: string;
    status: 'created' | 'processing' | 'completed' | 'failed';
    createdAt: string;
    updatedAt: string;
    steps: PipelineStep[];
}

export interface PipelineStep {
    id: string; // e.g., 'ingestion', 'synopsis'
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    artifacts?: Artifact[];
    error?: string;
    requiresReview?: boolean;
}

export interface Artifact {
    id: string;
    name: string;
    type: 'text' | 'json' | 'markdown';
    content: any; // content might be fetched separately or embedded
    preview?: string;
}

export interface CreateProjectResponse {
    success: boolean;
    data: Project;
}

export interface ProjectResponse {
    success: boolean;
    data: Project;
}

export const PIPELINE_STEPS = [
    { id: 'ingestion', name: 'Ingestion' },
    { id: 'synopsis', name: 'Synopsis' },
    { id: 'search-plans', name: 'Search Plans', requiresReview: true },
    { id: 'search-reports', name: 'Search Reports' },
    { id: 'evaluation', name: 'Evaluation' },
    { id: 'synthesis', name: 'Synthesis' }
];
