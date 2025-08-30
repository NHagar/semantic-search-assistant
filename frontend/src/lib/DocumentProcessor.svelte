<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { processedDocuments, setError, setLoading, selectedLLM, corpusName } from './stores.js';

  const dispatch = createEventDispatcher();
  
  let nTokens = 100;
  let tokenBudget = 6500;
  let processing = false;
  let processedContent = '';
  let llm = 'qwen/qwen3-14b';
  let corpus = '';

  // Subscribe to store values
  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });

  async function processDocuments() {
    processing = true;
    setLoading(true);
    
    try {
      const result = await apiService.processDocuments({
        n_tokens: nTokens,
        token_budget: tokenBudget
      }, llm, corpus);
      
      processedContent = result.content;
      processedDocuments.set(result.content);
      dispatch('processed', result);
      setError(null);
    } catch (err) {
      setError('Failed to process documents: ' + err.message);
    } finally {
      processing = false;
      setLoading(false);
    }
  }
</script>

<div class="document-processor">
  <div class="settings">
    <h3>Document Processing Settings</h3>
    
    <div class="setting-group">
      <label for="nTokens">Tokens per document:</label>
      <input 
        id="nTokens"
        type="number" 
        bind:value={nTokens} 
        min="10" 
        max="1000"
        disabled={processing}
      />
      <small>Number of tokens to sample from each document</small>
    </div>

    <div class="setting-group">
      <label for="tokenBudget">Total token budget:</label>
      <input 
        id="tokenBudget"
        type="number" 
        bind:value={tokenBudget} 
        min="1000" 
        max="50000"
        disabled={processing}
      />
      <small>Maximum total tokens across all documents</small>
    </div>

    <button 
      class="process-btn" 
      on:click={processDocuments}
      disabled={processing}
    >
      {#if processing}
        Processing Documents...
      {:else}
        Process Documents
      {/if}
    </button>
  </div>

  {#if processedContent}
    <div class="processed-content">
      <h4>Processed Content Preview</h4>
      <div class="content-preview">
        <pre>{processedContent.slice(0, 1000)}{processedContent.length > 1000 ? '...' : ''}</pre>
      </div>
      <p class="content-info">
        Total characters: {processedContent.length}
      </p>
    </div>
  {/if}
</div>

<style>
  .document-processor {
    max-width: 800px;
    margin: 0 auto;
  }

  .settings {
    background: white;
    padding: 24px;
    border-radius: 8px;
    border: 1px solid #ddd;
    margin-bottom: 20px;
  }

  .settings h3 {
    margin: 0 0 20px 0;
    color: #333;
  }

  .setting-group {
    margin-bottom: 20px;
  }

  .setting-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #333;
  }

  .setting-group input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .setting-group input:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  .setting-group small {
    display: block;
    margin-top: 4px;
    color: #666;
    font-size: 12px;
  }

  .process-btn {
    background: #2196F3;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    width: 100%;
  }

  .process-btn:hover:not(:disabled) {
    background: #1976D2;
  }

  .process-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .processed-content {
    background: white;
    padding: 24px;
    border-radius: 8px;
    border: 1px solid #ddd;
  }

  .processed-content h4 {
    margin: 0 0 16px 0;
    color: #333;
  }

  .content-preview {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 12px;
    max-height: 300px;
    overflow-y: auto;
  }

  .content-preview pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .content-info {
    margin: 0;
    font-size: 14px;
    color: #666;
  }
</style>