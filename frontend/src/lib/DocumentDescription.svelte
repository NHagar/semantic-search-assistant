<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { documentDescription, setError, setLoading } from './stores.js';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  
  let description = '';
  let editing = false;
  let generating = false;
  
  // Subscribe to store changes
  documentDescription.subscribe(value => {
    description = value;
  });

  onMount(async () => {
    await loadDescription();
  });

  async function loadDescription() {
    try {
      const result = await apiService.getDescription();
      description = result.content;
      documentDescription.set(result.content);
    } catch (err) {
      setError('Failed to load description: ' + err.message);
    }
  }

  async function generateDescription() {
    generating = true;
    setLoading(true);
    
    try {
      const result = await apiService.compressDocuments();
      description = result.content;
      documentDescription.set(result.content);
      dispatch('generated', result);
      setError(null);
    } catch (err) {
      setError('Failed to generate description: ' + err.message);
    } finally {
      generating = false;
      setLoading(false);
    }
  }

  async function saveDescription() {
    try {
      await apiService.updateDescription(description);
      documentDescription.set(description);
      editing = false;
      dispatch('saved', { content: description });
      setError(null);
    } catch (err) {
      setError('Failed to save description: ' + err.message);
    }
  }

  function cancelEdit() {
    // Restore original description
    documentDescription.subscribe(value => {
      description = value;
    });
    editing = false;
  }

  function startEditing() {
    editing = true;
  }
</script>

<div class="document-description">
  <div class="header">
    <h3>Document Corpus Description</h3>
    <div class="actions">
      {#if !description}
        <button 
          class="generate-btn" 
          on:click={generateDescription}
          disabled={generating}
        >
          {#if generating}
            Generating...
          {:else}
            Generate Description
          {/if}
        </button>
      {:else if editing}
        <button class="save-btn" on:click={saveDescription}>Save</button>
        <button class="cancel-btn" on:click={cancelEdit}>Cancel</button>
      {:else}
        <button class="edit-btn" on:click={startEditing}>Edit</button>
        <button class="regenerate-btn" on:click={generateDescription} disabled={generating}>
          {#if generating}
            Regenerating...
          {:else}
            Regenerate
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if description}
    <div class="description-content">
      {#if editing}
        <textarea
          bind:value={description}
          placeholder="Enter document corpus description..."
          rows="15"
        ></textarea>
      {:else}
        <div class="description-display">
          <pre>{description}</pre>
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
      <h4>No Description Generated</h4>
      <p>Generate a description of your document corpus to help with search planning.</p>
    </div>
  {/if}
</div>

<style>
  .document-description {
    max-width: 800px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .header h3 {
    margin: 0;
    color: #333;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions button {
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid;
    cursor: pointer;
    font-size: 14px;
  }

  .generate-btn, .regenerate-btn {
    background: #4CAF50;
    color: white;
    border-color: #4CAF50;
  }

  .generate-btn:hover:not(:disabled), .regenerate-btn:hover:not(:disabled) {
    background: #45a049;
  }

  .edit-btn {
    background: #2196F3;
    color: white;
    border-color: #2196F3;
  }

  .edit-btn:hover {
    background: #1976D2;
  }

  .save-btn {
    background: #4CAF50;
    color: white;
    border-color: #4CAF50;
  }

  .save-btn:hover {
    background: #45a049;
  }

  .cancel-btn {
    background: #f44336;
    color: white;
    border-color: #f44336;
  }

  .cancel-btn:hover {
    background: #d32f2f;
  }

  .actions button:disabled {
    background: #ccc;
    border-color: #ccc;
    cursor: not-allowed;
  }

  .description-content {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }

  .description-content textarea {
    width: 100%;
    border: none;
    padding: 20px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    outline: none;
  }

  .description-display {
    padding: 20px;
    max-height: 500px;
    overflow-y: auto;
  }

  .description-display pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #666;
  }

  .empty-state svg {
    margin-bottom: 20px;
    opacity: 0.5;
  }

  .empty-state h4 {
    margin: 0 0 12px 0;
    color: #333;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
  }
</style>