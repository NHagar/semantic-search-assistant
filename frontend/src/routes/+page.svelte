<script lang="ts">
	import { goto } from "$app/navigation";
	import "../app.css";

	let fileInput: HTMLInputElement;
	let isUploading = false;
	let error: string | null = null;

	async function handleUpload(e?: Event) {
		const target = e?.target as HTMLInputElement;
		const files = target?.files || fileInput?.files;

		if (!files || files.length === 0) return;

		isUploading = true;
		error = null;

		const formData = new FormData();
		// Append all files as 'files'
		for (let i = 0; i < files.length; i++) {
			formData.append("files", files[i]);
		}

		try {
			const res = await fetch("/api/projects", {
				method: "POST",
				body: formData,
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || "Upload failed");
			}

			const data = await res.json();
			if (data.success && data.data.id) {
				goto(`/projects/${data.data.id}`);
			} else {
				throw new Error("Invalid response from server");
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			isUploading = false;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			if (fileInput) {
				fileInput.files = files;
				handleUpload();
			}
		}
	}
</script>

<div
	class="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950 text-slate-200"
>
	<!-- Background decoration -->
	<div class="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
		<div
			class="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px]"
		></div>
		<div
			class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]"
		></div>
	</div>

	<div
		class="glass p-12 rounded-2xl max-w-xl w-full mx-4 z-10 animate-fade-in flex flex-col items-center text-center border border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-2xl"
	>
		<div class="mb-10">
			<h1
				class="mb-3 text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400"
			>
				Semantic Search Assistant
			</h1>
			<p class="text-slate-400 text-lg">
				Upload technical documentation to generate semantic search
				reports.
			</p>
		</div>

		<div
			class="w-full p-10 border-2 border-dashed border-slate-700/50 rounded-2xl hover:border-blue-500/50 hover:bg-slate-800/30 transition-all duration-300 cursor-pointer group"
			role="button"
			tabindex="0"
			on:keypress={(e) => {
				if (e.key === "Enter" || e.key === " ") fileInput.click();
			}}
			on:dragover|preventDefault
			on:drop|preventDefault={handleDrop}
			on:click={() => fileInput.click()}
		>
			<input
				type="file"
				accept=".pdf"
				multiple
				class="hidden"
				bind:this={fileInput}
				on:change={handleUpload}
			/>

			<div class="flex flex-col items-center gap-6">
				<div
					class="w-20 h-20 rounded-full bg-slate-800/80 group-hover:bg-slate-800 group-hover:scale-105 transition-all flex items-center justify-center shadow-lg border border-slate-700/50"
				>
					<svg
						class="w-8 h-8 text-blue-400 group-hover:text-blue-300 transition-colors"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
						/>
					</svg>
				</div>
				<div>
					<span class="font-semibold text-blue-400 text-lg"
						>Click to upload</span
					>
					<span class="text-slate-400"> or drag and drop</span>
					<p class="text-sm text-slate-500 mt-2">
						PDF files only (Multiple allowed)
					</p>
				</div>
			</div>
		</div>

		{#if isUploading}
			<div class="mt-8 flex flex-col items-center gap-3 text-slate-400">
				<div
					class="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"
				></div>
				<span class="animate-pulse">Processing your documents...</span>
			</div>
		{/if}

		{#if error}
			<div
				class="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 w-full animate-fade-in text-sm flex items-center gap-3"
			>
				<svg
					class="w-5 h-5 flex-shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				{error}
			</div>
		{/if}
	</div>
</div>

<style>
	/* Tailwind-like utilities if needed, but using app.css vars mainly */
	.text-secondary {
		color: var(--color-text-secondary);
	}
	.text-primary {
		color: var(--color-primary);
	}
	.bg-slate-900\/50 {
		background-color: rgba(15, 23, 42, 0.5);
	}
	.bg-slate-800 {
		background-color: var(--color-bg-surface);
	}
</style>
