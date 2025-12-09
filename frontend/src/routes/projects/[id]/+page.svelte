<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { project } from '$lib/stores/project';
	import Step from '$lib/components/Step.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ArtifactViewer from '$lib/components/ArtifactViewer.svelte';
	import PlanReviewer from '$lib/components/PlanReviewer.svelte';
	import type { PipelineStep } from '$lib/types';
	
	const projectId = $page.params.id as string;
	
	let activeSidebarStep: PipelineStep | null = null;
	let sidebarMode: 'view' | 'review' = 'view'; // 'view' artifacts or 'review' plans

	onMount(() => {
		project.startPolling(projectId);
	});

	onDestroy(() => {
		project.stopPolling();
	});

	function handleView(event: CustomEvent<PipelineStep>) {
		activeSidebarStep = event.detail;
		sidebarMode = 'view';
	}

	function handleReview(event: CustomEvent<PipelineStep>) {
		activeSidebarStep = event.detail;
		sidebarMode = 'review';
	}

	function closeSidebar() {
		activeSidebarStep = null;
	}

</script>

<div class="min-h-screen p-8 relative">
	<!-- Background decoration -->
	<div class="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
		<div class="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[128px]"></div>
	</div>

	<div class="max-w-4xl mx-auto relative z-10">
		<header class="mb-12 flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold mb-2">
					{#if $project}
						{$project.name}
					{:else}
						Loading Project...
					{/if}
				</h1>
				<p class="text-secondary">Project ID: {projectId}</p>
			</div>
			
			<div class="status-badge glass px-4 py-2 rounded-full text-sm font-medium">
				{#if $project}
					Status: <span class="uppercase tracking-wider">{$project.status}</span>
				{/if}
			</div>
		</header>

		<div class="pipeline-flow relative">
			<!-- Connecting Line -->
			<div class="absolute left-8 top-8 bottom-8 w-0.5 bg-slate-800 -z-10"></div>

			{#if $project}
				{#each $project.steps as step (step.id)}
					<Step 
						{step} 
						on:view={handleView}
						on:review={handleReview}
					/>
				{/each}
			{:else}
				<div class="flex justify-center p-12">
					<div class="spinner border-t-primary w-8 h-8"></div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Sidebar Overlay -->
	{#if activeSidebarStep}
		<Sidebar on:close={closeSidebar} title={activeSidebarStep.name}>
			{#if sidebarMode === 'view'}
				<ArtifactViewer step={activeSidebarStep} projectId={projectId} />
			{:else if sidebarMode === 'review'}
				<PlanReviewer step={activeSidebarStep} projectId={projectId} on:complete={closeSidebar} />
			{/if}
		</Sidebar>
	{/if}
</div>

<style>
	.text-secondary { color: var(--color-text-secondary); }
	.bg-primary\/5 { background-color: rgba(139, 92, 246, 0.05); }
	.status-badge { color: var(--color-accent); }
</style>
