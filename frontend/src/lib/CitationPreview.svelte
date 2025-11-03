<script>
  import { onMount } from 'svelte';
  import { API_BASE_URL } from './api.js';

  export let citationKey = '';
  export let llm = '';
  export let corpusName = '';

  let showPreview = false;
  let loading = false;
  let error = null;
  let citationData = null;
  let tooltipElement = null;
  let triggerElement = null;

  // Position tracking
  let tooltipStyle = '';

  async function fetchCitationSource() {
    if (loading || citationData) return; // Don't fetch if already loading or loaded

    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({
        llm: llm || '',
        corpus_name: corpusName || ''
      });

      const response = await fetch(
        `${API_BASE_URL}/citation-source/${encodeURIComponent(citationKey)}?${params}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch citation: ${response.statusText}`);
      }

      citationData = await response.json();
    } catch (err) {
      console.error('Error fetching citation source:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function handleMouseEnter() {
    showPreview = true;
    fetchCitationSource();
    updateTooltipPosition();
  }

  function handleMouseLeave() {
    showPreview = false;
  }

  function updateTooltipPosition() {
    if (!triggerElement || !tooltipElement) return;

    const rect = triggerElement.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();

    // Position below the citation by default
    let top = rect.bottom + window.scrollY + 10;
    let left = rect.left + window.scrollX;

    // Check if tooltip would go off right edge of screen
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 20;
    }

    // Check if tooltip would go off bottom of screen
    if (top + tooltipRect.height > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - tooltipRect.height - 10;
    }

    tooltipStyle = `top: ${top}px; left: ${left}px;`;
  }

  // Update position when showing
  $: if (showPreview && tooltipElement) {
    setTimeout(updateTooltipPosition, 0);
  }
</script>

<span
  class="citation-trigger"
  bind:this={triggerElement}
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
  role="button"
  tabindex="0"
  aria-label={`Citation ${citationKey}`}
>
  [{citationKey}]
</span>

{#if showPreview}
  <div
    class="citation-tooltip"
    bind:this={tooltipElement}
    style={tooltipStyle}
    on:mouseenter={handleMouseEnter}
    on:mouseleave={handleMouseLeave}
  >
    {#if loading}
      <div class="loading">Loading citation...</div>
    {:else if error}
      <div class="error">Error: {error}</div>
    {:else if citationData}
      <div class="citation-content">
        <div class="citation-header">
          <strong class="filename">{citationData.filename}</strong>
          <span class="chunk-id">Chunk {citationData.chunk_id}</span>
        </div>

        <div class="citation-text">
          {#if citationData.prev_chunk}
            <div class="context-chunk prev">...{citationData.prev_chunk.slice(-100)}</div>
          {/if}

          <div class="main-chunk">{citationData.content}</div>

          {#if citationData.next_chunk}
            <div class="context-chunk next">{citationData.next_chunk.slice(0, 100)}...</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .citation-trigger {
    color: #2563eb;
    cursor: pointer;
    text-decoration: none;
    font-weight: 500;
    padding: 0 2px;
    border-radius: 3px;
    transition: background-color 0.2s;
  }

  .citation-trigger:hover {
    background-color: #dbeafe;
    text-decoration: underline;
  }

  .citation-tooltip {
    position: absolute;
    z-index: 1000;
    background-color: white;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    padding: 16px;
    max-width: 500px;
    min-width: 300px;
    pointer-events: auto;
  }

  .loading, .error {
    padding: 12px;
    text-align: center;
    color: #6b7280;
  }

  .error {
    color: #dc2626;
  }

  .citation-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .citation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
  }

  .filename {
    font-size: 14px;
    color: #1f2937;
    word-break: break-word;
  }

  .chunk-id {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
  }

  .citation-text {
    font-size: 13px;
    line-height: 1.6;
    color: #374151;
  }

  .main-chunk {
    background-color: #fef3c7;
    padding: 8px;
    border-radius: 4px;
    border-left: 3px solid #f59e0b;
  }

  .context-chunk {
    color: #6b7280;
    font-style: italic;
    padding: 4px 8px;
  }

  .context-chunk.prev {
    text-align: right;
  }

  .context-chunk.next {
    text-align: left;
  }
</style>
