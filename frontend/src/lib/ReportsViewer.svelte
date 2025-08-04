<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { reports, setError, setLoading } from './stores.js';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  
  let reportsList = [];
  let selectedReport = null;
  let editingReport = null;
  let editContent = '';

  // Subscribe to store changes  
  reports.subscribe(value => {
    reportsList = value;
    if (reportsList.length > 0 && !selectedReport) {
      selectedReport = reportsList[0];
    }
  });

  onMount(async () => {
    await loadReports();
  });

  async function loadReports() {
    try {
      const result = await apiService.getReports();
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
      await apiService.updateReport(selectedReport.id, editContent);
      
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
            <div 
              class="report-item"
              class:selected={selectedReport && selectedReport.id === report.id}
              on:click={() => selectReport(report)}
            >
              <div class="report-title">Report {index + 1}</div>
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
              {/if}
            </div>
          </div>

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

  .report-title {
    font-weight: 500;
    color: #333;
    font-size: 14px;
    margin-bottom: 4px;
  }

  .report-filename {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #666;
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
</style>

<script>
  // Tab functionality
  function setupTabs() {
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
  }
  
  // Initialize tabs when component mounts
  onMount(() => {
    setupTabs();
  });
</script>