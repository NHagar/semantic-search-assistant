<script lang="ts">
	import type { PipelineStep, Artifact } from '$lib/types';
	import { onMount } from 'svelte';

	export let step: PipelineStep;
	export let projectId: string;

	let artifacts: Artifact[] = []; // In real app, we might fetch these specifically or use step.artifacts
	let loading = false;
	let error: string | null = null;
    let selectedArtifact: Artifact | null = null;

	onMount(async () => {
		// If artifacts are not fully populated in step, fetch them
        // For now, let's assume step has minimal info and we need to fetch details
        // Or if existing API provides them in project details, use that.
        // Assuming we might need to fetch content if it's large.
        
        if (step.artifacts) {
            artifacts = step.artifacts;
            if (artifacts.length > 0) selectedArtifact = artifacts[0];
        } else {
            console.log('ArtifactViewer mounted for project:', projectId, 'but no artifacts found on step.');
            // Mock fetching or handle fetching logic here if needed
            // For MVP, if step doesn't have artifacts, we might show "No artifacts"
        }
	});
    
    // Function to render artifact content based on type
    function renderContent(artifact: Artifact) {
        if (!artifact.content) return 'No content available.';
        if (artifact.type === 'json') return JSON.stringify(artifact.content, null, 2);
        return artifact.content;
    }

</script>

<div class="space-y-6">
    {#if artifacts.length === 0 && !loading}
        <div class="text-center py-12 text-slate-500">
            <p>No artifacts generated for this step.</p>
        </div>
    {:else}
        <!-- Tabs or Selector for multiple artifacts -->
        {#if artifacts.length > 1}
            <div class="flex flex-wrap gap-2 mb-4">
                {#each artifacts as art}
                    <button 
                        class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {selectedArtifact?.id === art.id ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}"
                        on:click={() => selectedArtifact = art}
                    >
                        {art.name}
                    </button>
                {/each}
            </div>
        {/if}

        <!-- Content Viewer -->
        {#if selectedArtifact}
            <div class="bg-slate-950 rounded-lg border border-slate-800 p-4 font-mono text-sm overflow-x-auto whitespace-pre-wrap">
                {renderContent(selectedArtifact)}
            </div>
        {/if}
    {/if}
</div>
