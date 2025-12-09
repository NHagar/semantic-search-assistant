import { writable, get } from 'svelte/store';
import type { Project, PipelineStep } from '$lib/types';
import { PIPELINE_STEPS } from '$lib/types';

function createProjectStore() {
    const { subscribe, set, update } = writable<Project | null>(null);

    let pollInterval: any;

    async function fetchProject(id: string) {
        try {
            const res = await fetch(`/api/projects/${id}`);
            if (!res.ok) throw new Error('Failed to fetch project');
            const data = await res.json();
            if (data.success) {
                // Map backend response to frontend structure if needed
                // For now assuming 1:1 or close enough mapping, we might need adapters
                // simulating steps structure based on backend data if backend doesn't return exactly this
                set(transformBackendData(data.data));
            }
        } catch (err) {
            console.error(err);
        }
    }

    function startPolling(id: string) {
        stopPolling();
        fetchProject(id);
        pollInterval = setInterval(() => fetchProject(id), 2000);
    }

    function stopPolling() {
        if (pollInterval) clearInterval(pollInterval);
    }

    function transformBackendData(backendProject: any): Project {
        const steps: PipelineStep[] = PIPELINE_STEPS.map(stepDef => {
            let status: PipelineStep['status'] = 'pending';
            let artifacts: any[] = [];

            // Ingestion
            if (stepDef.id === 'ingestion') {
                if (backendProject.document_count > 0) {
                    status = 'completed';
                } else if (backendProject.uploaded_file_count > 0) {
                    status = 'running';
                }
            }

            // Synopsis
            if (stepDef.id === 'synopsis') {
                if (backendProject.corpus_synopsis) {
                    status = 'completed';
                    artifacts.push({
                        id: 'synopsis-1',
                        name: 'Corpus Synopsis',
                        type: 'text',
                        content: backendProject.corpus_synopsis
                    });
                } else if (backendProject.document_count > 0) {
                    // detailed status logic
                }
            }

            // Search Plans
            if (stepDef.id === 'search-plans') {
                if (backendProject.plan_count > 0) {
                    status = 'completed';
                    // fetch plans separately or assume they are ready for review
                }
            }

            // Search Reports
            if (stepDef.id === 'search-reports') {
                if (backendProject.report_count > 0) status = 'completed';
            }

            // Evaluation (Placeholder logic)
            if (stepDef.id === 'evaluation') {
                if (backendProject.report_count > 0) {
                    // Assume complete if reports exist for now, or add specific field check later
                }
            }

            // Synthesis
            if (stepDef.id === 'synthesis') {
                if (backendProject.final_report) {
                    status = 'completed';
                    artifacts.push({
                        id: 'final-report',
                        name: 'Final Report',
                        type: 'markdown',
                        content: backendProject.final_report
                    });
                }
            }

            return {
                ...stepDef,
                status,
                artifacts
            };
        });

        return {
            id: backendProject.id,
            name: backendProject.project_name || 'Untitled Project', // backend maps project_name
            status: 'processing', // backend doesn't seem to have a master status field on top level in query?
            // Actually the query selects p.*, check if 'status' is a column in projects table.
            createdAt: backendProject.created_at || new Date().toISOString(),
            updatedAt: backendProject.updated_at || new Date().toISOString(),
            steps
        };
    }

    return {
        subscribe,
        set,
        update,
        fetch: fetchProject,
        startPolling,
        stopPolling
    };
}

export const project = createProjectStore();
