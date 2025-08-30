<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { finalReport, finalReportGenerated, setError, setLoading, selectedLLM, corpusName } from './stores.js';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  
  let report = '';
  let generating = false;
  let editing = false;
  let llm = 'qwen/qwen3-14b';
  let corpus = '';
  
  // Default synthesis query for comprehensive analysis
  const DEFAULT_SYNTHESIS_QUERY = "Provide a comprehensive analysis and synthesis of all research findings from the document corpus";
  
  // Subscribe to store changes
  finalReport.subscribe(value => {
    report = value;
  });
  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });

  onMount(async () => {
    // Wait a bit for stores to initialize
    setTimeout(async () => {
      await loadFinalReport();
    }, 100);
  });

  async function loadFinalReport() {
    try {
      const result = await apiService.getFinalReport(llm, corpus);
      report = result.content;
      finalReport.set(result.content);
      finalReportGenerated.set(!!result.content);
    } catch (err) {
      setError('Failed to load final report: ' + err.message);
    }
  }

  async function generateFinalReport() {
    generating = true;
    setLoading(true);
    
    try {
      const result = await apiService.synthesizeFinalReport(DEFAULT_SYNTHESIS_QUERY, llm, corpus);
      report = result.content;
      finalReport.set(result.content);
      finalReportGenerated.set(true);
      dispatch('generated', result);
      setError(null);
    } catch (err) {
      setError('Failed to generate final report: ' + err.message);
    } finally {
      generating = false;
      setLoading(false);
    }
  }

  async function saveFinalReport() {
    try {
      await apiService.updateFinalReport(report, llm, corpus);
      finalReport.set(report);
      editing = false;
      dispatch('saved', { content: report });
      setError(null);
    } catch (err) {
      setError('Failed to save final report: ' + err.message);
    }
  }

  function cancelEdit() {
    // Restore original report
    finalReport.subscribe(value => {
      report = value;
    });
    editing = false;
  }

  function startEditing() {
    editing = true;
  }

  async function regenerateReport() {
    report = '';
    finalReport.set('');
    finalReportGenerated.set(false);
    await generateFinalReport();
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'final_report.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(report).then(() => {
      // Could show a toast notification here
      console.log('Report copied to clipboard');
    }).catch(err => {
      setError('Failed to copy to clipboard: ' + err.message);
    });
  }

  function getWordCount(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  function getCharacterCount(text) {
    return text.length;
  }

  function getEstimatedReadTime(text) {
    const wordsPerMinute = 200;
    const wordCount = getWordCount(text);
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    return minutes;
  }
</script>

<div class="final-report">
  <div class="header">
    <h3>Final Synthesized Report</h3>
    <div class="header-actions">
      {#if report}
        <div class="report-stats">
          <span class="stat">{getWordCount(report)} words</span>
          <span class="stat">{getCharacterCount(report)} chars</span>
          <span class="stat">~{getEstimatedReadTime(report)} min read</span>
        </div>
      {/if}
      
      {#if report && !editing}
        <div class="action-buttons">
          <button class="copy-btn" on:click={copyToClipboard} title="Copy to clipboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="download-btn" on:click={downloadReport} title="Download as Markdown">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7,10 12,15 17,10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if !report}
    <div class="generate-section">
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10,9 9,9 8,9"></polyline>
        </svg>
        <h4>No Final Report Generated</h4>
        <p>Generate a comprehensive final report that synthesizes all research findings from your search plans.</p>
      </div>

      <button 
        class="generate-btn" 
        on:click={generateFinalReport}
        disabled={generating}
      >
        {#if generating}
          Generating Final Report...
        {:else}
          Generate Final Report
        {/if}
      </button>
    </div>
  {:else}
    <div class="report-section">
      <div class="report-actions">
        {#if editing}
          <button class="save-btn" on:click={saveFinalReport}>Save Changes</button>
          <button class="cancel-btn" on:click={cancelEdit}>Cancel</button>
        {:else}
          <button class="edit-btn" on:click={startEditing}>Edit Report</button>
          <button class="regenerate-btn" on:click={regenerateReport} disabled={generating}>
            {#if generating}
              Regenerating...
            {:else}
              Regenerate
            {/if}
          </button>
        {/if}
      </div>

      <div class="report-content">
        {#if editing}
          <textarea
            bind:value={report}
            placeholder="Edit the final report..."
            rows="25"
            class="report-editor"
          ></textarea>
        {:else}
          <div class="report-display">
            {#if report.includes('# ')}
              <!-- Render as HTML if it contains markdown headers -->
              <div class="markdown-content">
                {@html report
                  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  .replace(/\n\n/g, '</p><p>')
                  .replace(/^(.+)$/, '<p>$1</p>')
                }
              </div>
            {:else}
              <pre class="report-text">{report}</pre>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="completion-message">
      <div class="success-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22,4 12,14.01 9,11.01"></polyline>
        </svg>
      </div>
      <div class="message-content">
        <h4>Research Complete!</h4>
        <p>Your comprehensive research report has been generated and is ready for review.</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .final-report {
    max-width: 900px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .header h3 {
    margin: 0;
    color: #333;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .report-stats {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #666;
  }

  .stat {
    background: #f8f9fa;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #e9ecef;
  }

  .action-buttons {
    display: flex;
    gap: 8px;
  }

  .copy-btn,
  .download-btn {
    background: #6c757d;
    color: white;
    border: none;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .copy-btn:hover,
  .download-btn:hover {
    background: #5a6268;
  }


  .generate-section {
    text-align: center;
  }

  .empty-state {
    padding: 60px 20px 40px;
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

  .generate-btn {
    background: #4CAF50;
    color: white;
    border: none;
    padding: 16px 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    font-weight: 500;
  }

  .generate-btn:hover:not(:disabled) {
    background: #45a049;
  }

  .generate-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .report-section {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 30px;
  }

  .report-actions {
    background: #f8f9fa;
    padding: 16px 20px;
    border-bottom: 1px solid #e9ecef;
    display: flex;
    gap: 8px;
  }

  .report-actions button {
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid;
    cursor: pointer;
    font-size: 14px;
  }

  .edit-btn {
    background: #2196F3;
    color: white;
    border-color: #2196F3;
  }

  .edit-btn:hover {
    background: #1976D2;
  }

  .regenerate-btn {
    background: #FF9800;
    color: white;
    border-color: #FF9800;
  }

  .regenerate-btn:hover:not(:disabled) {
    background: #F57C00;
  }

  .regenerate-btn:disabled {
    background: #ccc;
    border-color: #ccc;
    cursor: not-allowed;
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

  .report-content {
    min-height: 400px;
  }

  .report-editor {
    width: 100%;
    min-height: 500px;
    border: none;
    padding: 24px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
  }

  .report-display {
    padding: 24px;
    min-height: 400px;
  }

  .markdown-content {
    line-height: 1.6;
    color: #333;
  }

  .markdown-content h1 {
    font-size: 28px;
    margin: 0 0 20px 0;
    color: #2c3e50;
    border-bottom: 2px solid #3498db;
    padding-bottom: 10px;
  }

  .markdown-content h2 {
    font-size: 22px;
    margin: 24px 0 16px 0;
    color: #34495e;
  }

  .markdown-content h3 {
    font-size: 18px;
    margin: 20px 0 12px 0;
    color: #2c3e50;
  }

  .markdown-content h4 {
    font-size: 16px;
    margin: 16px 0 8px 0;
    color: #34495e;
  }

  .markdown-content p {
    margin: 0 0 16px 0;
  }

  .markdown-content strong {
    font-weight: 600;
    color: #2c3e50;
  }

  .markdown-content em {
    font-style: italic;
    color: #7f8c8d;
  }

  .report-text {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    color: #333;
  }

  .completion-message {
    display: flex;
    align-items: center;
    gap: 16px;
    background: #e8f5e8;
    border: 1px solid #4caf50;
    border-radius: 8px;
    padding: 20px;
  }

  .success-icon {
    color: #4caf50;
    flex-shrink: 0;
  }

  .message-content h4 {
    margin: 0 0 4px 0;
    color: #2e7d32;
    font-size: 16px;
  }

  .message-content p {
    margin: 0;
    color: #388e3c;
    font-size: 14px;
  }
</style>