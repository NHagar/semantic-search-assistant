<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	export let title: string = '';
	
	const dispatch = createEventDispatcher();

	function close() {
		dispatch('close');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
	<!-- Backdrop -->
	<div 
		class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
		on:click={close}
		on:keypress={handleKeydown}
		transition:fade={{ duration: 200 }}
        role="button"
        tabindex="0"
	></div>

	<!-- Panel -->
	<div 
		class="relative w-full max-w-2xl h-full bg-slate-900 border-l border-white/10 shadow-2xl overflow-hidden flex flex-col"
		transition:fly={{ x: 100, duration: 300 }}
	>
		<!-- Header -->
		<div class="p-6 border-b border-white/10 flex items-center justify-between bg-slate-900/50 backdrop-blur-md z-10">
			<h2 class="text-xl font-bold">{title}</h2>
			<button class="btn-icon text-slate-400 hover:text-white transition-colors" on:click={close}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-6">
			<slot />
		</div>
	</div>
</div>

<style>
	.btn-icon {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: var(--radius-md);
	}
	.btn-icon:hover {
		background: rgba(255,255,255,0.1);
	}
</style>
