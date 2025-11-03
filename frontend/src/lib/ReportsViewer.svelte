<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { reports, reportEvaluations, setError, setLoading, selectedLLM, corpusName } from './stores.js';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  
  let reportsList = [];
  let selectedReport = null;
  let editingReport = null;
  let editContent = '';
  let regeneratingReport = null;
  let llm = 'qwen/qwen3-14b';
  let corpus = '';
  let evaluationData = null;

  // Subscribe to store changes
  reports.subscribe(value => {
    reportsList = value;
    if (reportsList.length > 0 && !selectedReport) {
      selectedReport = reportsList[0];
    }
  });
  reportEvaluations.subscribe(value => {
    evaluationData = value;
  });
  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });

  onMount(async () => {
    setupTabs();
    // Wait a bit for stores to initialize
    setTimeout(async () => {
      await loadReports();
    }, 100);
  });

  function setupTabs() {
    // Use setTimeout to ensure DOM elements are available
    setTimeout(() => {
      const tabBtns = document.querySelectorAll('.tab-btn');
      const tabPanels = document.querySelectorAll('.tab-panel');
      
      tabBtns.forEach((btn, index) => {
        btn.addEventListener('click', () => {
          // Remove active class from all tabs and panels
          tabBtns.forEach(b => b.classList.remove('active'));
          tabPanels.forEach(p => {
            p.classList.remove('active');
            p.style.display = 'none';
          });
          
          // Add active class to clicked tab and corresponding panel
          btn.classList.add('active');
          tabPanels[index].classList.add('active');
          tabPanels[index].style.display = 'block';
        });
      });
    }, 100);
  }

  async function loadReports() {
    try {
      const result = await apiService.getReports(llm, corpus);
      reportsList = result.reports;
      reports.set(result.reports);
      
      if (reportsList.length > 0 && !selectedReport) {
        selectedReport = reportsList[0];
      }
    } catch (err) {
      setError('Failed to load reports: ' + err.message);
    }
  }

  function selectReport(report) {
    selectedReport = report;
    editingReport = null;
  }

  function startEditing() {
    editingReport = selectedReport.id;
    editContent = getReportMainContent(selectedReport.content);
  }

  async function saveReport() {
    try {
      await apiService.updateReport(selectedReport.id, editContent, llm, corpus);
      
      // Update local state
      reportsList = reportsList.map(r => 
        r.id === selectedReport.id ? { ...r, content: editContent } : r
      );
      reports.set(reportsList);
      selectedReport = { ...selectedReport, content: editContent };
      
      editingReport = null;
      editContent = '';
      dispatch('saved', { reportId: selectedReport.id, content: editContent });
      setError(null);
    } catch (err) {
      setError('Failed to save report: ' + err.message);
    }
  }

  function cancelEdit() {
    editingReport = null;
    editContent = '';
  }

  async function regenerateReport() {
    if (!selectedReport) return;
    
    try {
      setLoading(true);
      regeneratingReport = selectedReport.id;
      
      const result = await apiService.regenerateReport(selectedReport.id, llm, corpus);
      
      // Update local state with regenerated content
      reportsList = reportsList.map(r => 
        r.id === selectedReport.id ? { ...r, content: result.content } : r
      );
      reports.set(reportsList);
      selectedReport = { ...selectedReport, content: result.content };
      
      regeneratingReport = null;
      setError(null);
      dispatch('regenerated', { reportId: selectedReport.id, content: result.content });
    } catch (err) {
      regeneratingReport = null;
      setError('Failed to regenerate report: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function getReportMainContent(fullContent) {
    // Split by debug log and return main content
    const parts = fullContent.split('=== SEARCH AGENT DEBUG LOG ===');
    return parts[0].trim();
  }

  function getReportDebugLog(fullContent) {
    // Split by debug log and return debug section
    const parts = fullContent.split('=== SEARCH AGENT DEBUG LOG ===');
    return parts.length > 1 ? parts[1].trim() : '';
  }

  function parseToolCalls(debugLog) {
    if (!debugLog) return [];

    const toolCalls = [];
    const lines = debugLog.split('\n');
    let currentCall = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('Tool Call')) {
        if (currentCall) {
          toolCalls.push(currentCall);
        }
        currentCall = {
          id: line,
          function: '',
          arguments: '',
          result: ''
        };
      } else if (line.startsWith('Function:') && currentCall) {
        currentCall.function = line.replace('Function:', '').trim();
      } else if (line.startsWith('Arguments:') && currentCall) {
        currentCall.arguments = line.replace('Arguments:', '').trim();
      } else if (line.startsWith('Result:') && currentCall) {
        // Result might span multiple lines
        let resultLines = [line.replace('Result:', '').trim()];
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith('Tool Call') && !lines[j].trim().startsWith('---')) {
          if (lines[j].trim()) {
            resultLines.push(lines[j].trim());
          }
          j++;
        }
        currentCall.result = resultLines.join('\n');
        i = j - 1;
      }
    }

    if (currentCall) {
      toolCalls.push(currentCall);
    }

    return toolCalls;
  }

  function formatResult(result) {
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return result;
    }
  }

  function getReportEvaluation(reportFilename) {
    if (!evaluationData || !evaluationData.report_evaluations) {
      return null;
    }
    return evaluationData.report_evaluations.find(e => e.report_filename === reportFilename);
  }

  function getStatusBadge(status) {
    const badges = {
      'used': { label: 'Used', class: 'status-used' },
      'discarded': { label: 'Discarded', class: 'status-discarded' },
      'used_fallback': { label: 'Used (Fallback)', class: 'status-fallback' },
      'error': { label: 'Error', class: 'status-error' }
    };
    return badges[status] || null;
  }
</script>

<div class="reports-viewer">
  <div class="header">
    <h3>Generated Reports</h3>
    <span class="report-count">{reportsList.length} report{reportsList.length !== 1 ? 's' : ''}</span>
  </div>

  {#if reportsList.length === 0}
    <div class="empty-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <h4>No Reports Available</h4>
      <p>Execute search plans to generate reports for review.</p>
    </div>
  {:else}
    <div class="reports-layout">
      <div class="reports-sidebar">
        <h4>Reports</h4>
        <div class="reports-list">
          {#each reportsList as report, index}
            {@const evaluation = getReportEvaluation(report.filename)}
            {@const badge = evaluation ? getStatusBadge(evaluation.status) : null}
            <div
              class="report-item"
              class:selected={selectedReport && selectedReport.id === report.id}
              on:click={() => selectReport(report)}
            >
              <div class="report-header-row">
                <div class="report-title">Report {index + 1}</div>
                {#if badge}
                  <span class="status-badge {badge.class}">{badge.label}</span>
                {/if}
              </div>
              <div class="report-filename">{report.filename}</div>
            </div>
          {/each}
        </div>
      </div>

      <div class="report-content">
        {#if selectedReport}
          <div class="report-header">
            <h4>Report Details</h4>
            <div class="report-actions">
              {#if editingReport === selectedReport.id}
                <button class="save-btn" on:click={saveReport}>Save</button>
                <button class="cancel-btn" on:click={cancelEdit}>Cancel</button>
              {:else}
                <button class="edit-btn" on:click={startEditing}>Edit Report</button>
                <button
                  class="regenerate-btn"
                  on:click={regenerateReport}
                  disabled={regeneratingReport === selectedReport.id}
                >
                  {regeneratingReport === selectedReport.id ? 'Regenerating...' : 'Regenerate'}
                </button>
              {/if}
            </div>
          </div>

          {@const evaluation = getReportEvaluation(selectedReport.filename)}
          {#if evaluation}
            <div class="evaluation-info">
              <div class="evaluation-header">
                <strong>Evaluation Results</strong>
                {@const badge = getStatusBadge(evaluation.status)}
                {#if badge}
                  <span class="status-badge {badge.class}">{badge.label}</span>
                {/if}
              </div>
              <div class="evaluation-details">
                <div class="eval-item">
                  <span class="eval-label">Relevant:</span>
                  <span class="eval-value {evaluation.is_relevant ? 'positive' : 'negative'}">
                    {evaluation.is_relevant ? 'Yes' : 'No'}
                  </span>
                </div>
                <div class="eval-item">
                  <span class="eval-label">Thorough:</span>
                  <span class="eval-value {evaluation.is_thorough ? 'positive' : 'negative'}">
                    {evaluation.is_thorough ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              {#if evaluation.reason}
                <div class="evaluation-reason">
                  <strong>Reason:</strong> {evaluation.reason}
                </div>
              {/if}
            </div>
          {/if}

          <div class="report-tabs">
            <div class="tabs-header">
              <button class="tab-btn active">Main Report</button>
              <button class="tab-btn">Debug Log</button>
            </div>

            <div class="tab-content">
              <!-- Main Report Tab -->
              <div class="tab-panel active">
                {#if editingReport === selectedReport.id}
                  <textarea
                    bind:value={editContent}
                    rows="20"
                    class="report-editor"
                    placeholder="Edit the report content..."
                  ></textarea>
                {:else}
                  <div class="report-display">
                    <pre>{getReportMainContent(selectedReport.content)}</pre>
                  </div>
                {/if}
              </div>

              <!-- Debug Log Tab (hidden by default) -->
              <div class="tab-panel" style="display: none;">
                {#if selectedReport}
                  {@const debugLog = getReportDebugLog(selectedReport.content)}
                  {@const toolCalls = parseToolCalls(debugLog)}
                  
                  {#if toolCalls.length > 0}
                    <div class="debug-section">
                      <h5>Tool Calls ({toolCalls.length})</h5>
                      {#each toolCalls as toolCall}
                        <div class="tool-call">
                          <div class="tool-call-header">
                            <strong>{toolCall.id}</strong>
                            <span class="function-name">{toolCall.function}</span>
                          </div>
                          
                          <div class="tool-call-details">
                            <div class="arguments">
                              <strong>Arguments:</strong>
                              <pre>{toolCall.arguments}</pre>
                            </div>
                            
                            <div class="result">
                              <strong>Result:</strong>
                              <pre>{formatResult(toolCall.result)}</pre>
                            </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}

                  {#if debugLog}
                    <div class="raw-debug">
                      <h5>Raw Debug Log</h5>
                      <pre class="debug-log">{debugLog}</pre>
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="next-step">
      <button class="synthesize-btn" on:click={() => dispatch('synthesize')}>
        Generate Final Report
      </button>
    </div>
  {/if}
</div>

<style>
  .reports-viewer {
    max-width: 1200px;
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

  .report-count {
    background: #e3f2fd;
    color: #1976d2;
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 500;
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

  .reports-layout {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 20px;
    height: 600px;
  }

  .reports-sidebar {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 16px;
    overflow-y: auto;
  }

  .reports-sidebar h4 {
    margin: 0 0 16px 0;
    color: #333;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .reports-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .report-item {
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .report-item:hover {
    background: #f8f9fa;
    border-color: #007bff;
  }

  .report-item.selected {
    background: #e3f2fd;
    border-color: #1976d2;
  }

  .report-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    gap: 8px;
  }

  .report-title {
    font-weight: 500;
    color: #333;
    font-size: 14px;
  }

  .report-filename {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #666;
  }

  .status-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .status-used {
    background: #4caf50;
    color: white;
  }

  .status-discarded {
    background: #ff9800;
    color: white;
  }

  .status-fallback {
    background: #ffc107;
    color: #333;
  }

  .status-error {
    background: #f44336;
    color: white;
  }

  .report-content {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .report-header {
    background: #f8f9fa;
    padding: 16px 20px;
    border-bottom: 1px solid #e9ecef;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .report-header h4 {
    margin: 0;
    color: #333;
    font-size: 16px;
  }

  .report-actions {
    display: flex;
    gap: 8px;
  }

  .report-actions button {
    padding: 6px 12px;
    border-radius: 4px;
    border: 1px solid;
    cursor: pointer;
    font-size: 12px;
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

  .regenerate-btn {
    background: #ff9800;
    color: white;
    border-color: #ff9800;
  }

  .regenerate-btn:hover:not(:disabled) {
    background: #f57c00;
  }

  .regenerate-btn:disabled {
    background: #ffcc80;
    cursor: not-allowed;
  }

  .report-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .tabs-header {
    display: flex;
    border-bottom: 1px solid #e9ecef;
  }

  .tab-btn {
    background: none;
    border: none;
    padding: 12px 20px;
    cursor: pointer;
    font-size: 14px;
    color: #666;
    border-bottom: 2px solid transparent;
  }

  .tab-btn.active {
    color: #1976d2;
    border-bottom-color: #1976d2;
  }

  .tab-btn:hover {
    background: #f8f9fa;
  }

  .tab-content {
    flex: 1;
    overflow: hidden;
  }

  .tab-panel {
    height: 100%;
    overflow-y: auto;
  }

  .tab-panel.active {
    display: block;
  }

  .report-editor {
    width: 100%;
    height: 100%;
    border: none;
    padding: 20px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: none;
    outline: none;
  }

  .report-display {
    padding: 20px;
    height: 100%;
    overflow-y: auto;
  }

  .report-display pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .debug-section {
    padding: 20px;
  }

  .debug-section h5 {
    margin: 0 0 16px 0;
    color: #333;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tool-call {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .tool-call-header {
    background: #e9ecef;
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
  }

  .function-name {
    color: #007bff;
    font-family: 'Courier New', monospace;
  }

  .tool-call-details {
    padding: 12px;
  }

  .arguments,
  .result {
    margin-bottom: 12px;
  }

  .arguments strong,
  .result strong {
    display: block;
    margin-bottom: 4px;
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .arguments pre,
  .result pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.3;
    background: white;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 8px;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 150px;
    overflow-y: auto;
  }

  .raw-debug {
    padding: 20px;
    border-top: 1px solid #e9ecef;
  }

  .raw-debug h5 {
    margin: 0 0 12px 0;
    color: #333;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .debug-log {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.3;
    background: #1a1a1a;
    color: #90cdf4;
    border-radius: 4px;
    padding: 16px;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 400px;
    overflow-y: auto;
  }

  .next-step {
    margin-top: 30px;
    text-align: center;
  }

  .synthesize-btn {
    background: #4caf50;
    color: white;
    border: none;
    padding: 16px 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    font-weight: 500;
  }

  .synthesize-btn:hover {
    background: #45a049;
  }

  .evaluation-info {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 16px;
    margin: 16px 20px;
  }

  .evaluation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 14px;
    color: #333;
  }

  .evaluation-details {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }

  .eval-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: white;
    border-radius: 4px;
  }

  .eval-label {
    font-size: 12px;
    color: #666;
    font-weight: 500;
  }

  .eval-value {
    font-size: 13px;
    font-weight: 600;
  }

  .eval-value.positive {
    color: #4caf50;
  }

  .eval-value.negative {
    color: #f44336;
  }

  .evaluation-reason {
    padding: 8px 12px;
    background: white;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.5;
  }

  .evaluation-reason strong {
    color: #333;
    display: inline-block;
    margin-right: 4px;
  }
</style>