<script lang="ts">
	import type { PipelineStep } from '$lib/types';
	import { createEventDispatcher } from 'svelte';

	export let step: PipelineStep;
	export let projectId: string;

    const dispatch = createEventDispatcher();
    
    // Mock plans structure - ideally fetched from artifact or step data
    let plans: any[] = []; 
    let selectedPlanId: string | null = null;
    let submitting = false;

    // Initialize plans from step artifact if available
    $: if (step.artifacts) {
        const planArtifact = step.artifacts.find(a => a.type === 'json'); // Assuming plans are in JSON
        if (planArtifact && Array.isArray(planArtifact.content)) {
            plans = planArtifact.content;
        } else if (planArtifact && planArtifact.content.plans) {
             plans = planArtifact.content.plans;
        }
        // Fallback for demo if no content
        if (plans.length === 0) {
             plans = [
                { id: '1', name: 'Comprehensive Search', description: 'Deep dive into all aspects.', queries: ['query 1', 'query 2'] },
                { id: '2', name: 'Focused Search', description: 'Quick check key points.', queries: ['query A'] }
            ];
        }
    }

    async function handleConfirm() {
        if (!selectedPlanId) return;
        submitting = true;
        try {
            const res = await fetch(`/api/projects/${projectId}/plans/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: selectedPlanId })
            });
            
            if (res.ok) {
                dispatch('complete');
            } else {
                console.error('Failed to select plan');
            }
        } catch (e) {
            console.error(e);
        } finally {
            submitting = false;
        }
    }
</script>

<div class="space-y-6">
    <div class="prose prose-invert">
        <p class="text-slate-400">Review the generated search plans and select one to proceed.</p>
    </div>

    <div class="space-y-4">
        {#each plans as plan}
            <!-- Svelte doesn't support class directives on components nicely without extra setup, using standard class -->
            <div 
                class="p-4 rounded-lg border cursor-pointer transition-all {selectedPlanId === plan.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-slate-700 bg-slate-800 hover:border-slate-500'}"
                on:click={() => selectedPlanId = plan.id}
                on:keypress={() => selectedPlanId = plan.id}
                role="button"
                tabindex="0"
            >
                <div class="flex items-start justify-between mb-2">
                    <h3 class="font-semibold text-lg">{plan.name || 'Untitled Plan'}</h3>
                    {#if selectedPlanId === plan.id}
                        <div class="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>
                        </div>
                    {/if}
                </div>
                <p class="text-slate-400 text-sm mb-3">{plan.description || 'No description'}</p>
                
                {#if plan.queries}
                    <div class="bg-slate-900/50 rounded p-2 text-xs font-mono text-slate-500">
                        {plan.queries.length} queries
                    </div>
                {/if}
            </div>
        {/each}
    </div>

    <div class="pt-4 border-t border-white/10 flex justify-end">
        <button 
            class="btn btn-primary" 
            disabled={!selectedPlanId || submitting}
            on:click={handleConfirm}
        >
            {#if submitting}
                Processing...
            {:else}
                Confirm Selection
            {/if}
        </button>
    </div>
</div>
