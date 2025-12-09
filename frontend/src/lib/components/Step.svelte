<script lang="ts">
	import type { PipelineStep } from '$lib/types';
	import { createEventDispatcher } from 'svelte';

	export let step: PipelineStep;
	
	const dispatch = createEventDispatcher();

	$: isPending = step.status === 'pending';
	$: isRunning = step.status === 'running';
	$: isCompleted = step.status === 'completed';
	$: isFailed = step.status === 'failed';

	$: statusIcon = isCompleted ? '✓' : isFailed ? '✕' : '';
</script>

<div class="step-card group" class:active={isRunning} class:completed={isCompleted} class:pending={isPending}>
	<div class="flex items-center gap-4">
		<!-- Status Indicator -->
		<div class="status-indicator">
			{#if isRunning}
				<div class="spinner"></div>
			{:else if isCompleted}
				<div class="w-full h-full rounded-full bg-green-500/20 text-green-400 flex items-center justify-center font-bold">✓</div>
			{:else if isFailed}
				<div class="w-full h-full rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold">✕</div>
			{:else}
				<div class="w-full h-full rounded-full border border-slate-700"></div>
			{/if}
		</div>

		<!-- Step Info -->
		<div class="flex-1">
			<h3 class="text-lg font-medium transition-colors" class:text-slate-500={isPending} class:text-white={!isPending}>
				{step.name}
			</h3>
			{#if isRunning}
				<p class="text-sm text-accent animate-pulse">Processing...</p>
			{:else if isCompleted}
				<p class="text-sm text-slate-400">Completed</p>
			{/if}
		</div>

		<!-- Actions -->
		<div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
			{#if isCompleted}
				<button class="btn-sm btn-glass" on:click={() => dispatch('view', step)}>
					View Artifacts
				</button>
			{/if}
			{#if step.requiresReview && isCompleted}
				<button class="btn-sm btn-primary ml-2" on:click={() => dispatch('review', step)}>
					Review
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.step-card {
		padding: 1.5rem;
		border-radius: var(--radius-lg);
		background: var(--color-bg-surface);
		border: 1px solid rgba(255,255,255,0.05);
		transition: all 0.3s ease;
		margin-bottom: 1rem;
	}

	.step-card.active {
		border-color: var(--color-primary);
		box-shadow: 0 0 20px -5px var(--color-primary-glow);
	}

	.step-card.completed {
		border-color: var(--color-success);
	}

	.status-indicator {
		width: 2.5rem;
		height: 2.5rem;
		flex-shrink: 0;
	}

	.btn-sm {
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-glass {
		background: rgba(255,255,255,0.1);
		color: white;
		border: 1px solid rgba(255,255,255,0.1);
	}
	.btn-glass:hover {
		background: rgba(255,255,255,0.2);
	}

	.btn-primary {
		background: var(--color-primary);
		color: white;
		border: none;
	}
	.btn-primary:hover {
		background: var(--color-primary-hover);
	}

	.text-accent { color: var(--color-accent); }
	.text-slate-500 { color: var(--color-text-secondary); }
	.text-white { color: var(--color-text-primary); }
</style>
