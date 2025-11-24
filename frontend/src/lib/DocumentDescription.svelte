<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { documentDescription, setError, selectedLLM, corpusName } from './stores.js';
  import { API_BASE_URL } from './api.js';

  const dispatch = createEventDispatcher();

  export let autoGenerate = false;

  let description = '';
  let generating = false;
  let llm = 'qwen/qwen3-14b';
  let corpus = '';

  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });
  documentDescription.subscribe(value => { description = value; });

  onMount(async () => {
    // Load existing description if available
    await loadDescription();

    // Auto-generate if requested and no description exists
    if (autoGenerate && !description) {
      await generateDescription();
    }
  });

  async function loadDescription() {
    try {
      const response = await fetch(`${API_BASE_URL}/get-description?llm=${encodeURIComponent(llm)}&corpus_name=${encodeURIComponent(corpus)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.content) {
          description = data.content;
          documentDescription.set(data.content);
        }
      }
    } catch (err) {
      console.error('Failed to load description:', err);
    }
  }

  async function generateDescription() {
    if (generating) return;

    generating = true;
    description = '';
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/compress-documents-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llm,
          corpus_name: corpus,
          documents: null
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              // Save the final description
              documentDescription.set(description);
              dispatch('generated', { content: description });
              // Automatically advance to next step
              setTimeout(() => {
                dispatch('saved', { content: description });
              }, 500);
              continue;
            }

            if (data.startsWith('[ERROR]')) {
              throw new Error(data.slice(8));
            }

            description += data;
          }
        }
      }
    } catch (err) {
      setError('Failed to generate description: ' + err.message);
    } finally {
      generating = false;
    }
  }
</script>

<div class="document-description">
  <div class="description-container">
    {#if generating}
      <div class="streaming-indicator">
        <div class="pulse-dot"></div>
        <span>Generating corpus synopsis...</span>
      </div>
    {/if}

    {#if description}
      <div class="description-display">
        <pre>{description}</pre>
        {#if generating}
          <span class="cursor">▊</span>
        {/if}
      </div>
    {:else if !generating}
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
        <h4>Generating description...</h4>
        <p>The synopsis will appear here automatically.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .document-description {
    max-width: 900px;
    margin: 0 auto;
  }

  .description-container {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    min-height: 400px;
    position: relative;
  }

  .streaming-indicator {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #e3f2fd;
    border-radius: 20px;
    font-size: 13px;
    color: #1565c0;
    font-weight: 500;
    z-index: 10;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background: #1565c0;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(0.8);
    }
  }

  .description-display {
    padding: 32px;
    max-height: 600px;
    overflow-y: auto;
    position: relative;
  }

  .description-display pre {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-wrap: break-word;
    color: #333;
  }

  .cursor {
    display: inline-block;
    animation: blink 1s step-start infinite;
    color: #2196F3;
    font-weight: bold;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
    padding: 60px 20px;
    color: #666;
  }

  .empty-state svg {
    margin-bottom: 24px;
    opacity: 0.4;
  }

  .empty-state h4 {
    margin: 0 0 12px 0;
    color: #333;
    font-size: 18px;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }
</style>
