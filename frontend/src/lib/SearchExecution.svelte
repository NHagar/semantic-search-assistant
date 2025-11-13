<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { reports, reportsGenerated, setError, setLoading, selectedLLM, corpusName, selectedPlanIds } from './stores.js';
  import { onMount } from 'svelte';
  import MarkdownRenderer from './MarkdownRenderer.svelte';

  const dispatch = createEventDispatcher();

  let executing = false;
  let executionLogs = [];
  let chunkSize = 1024;
  let overlap = 20;
  let executionComplete = false;
  let generatedReports = [];
  let llm = 'qwen/qwen3-14b';
  let corpus = '';
  let planIds = [];

  // Subscribe to store changes
  reports.subscribe(value => {
    generatedReports = value;
  });
  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });
  selectedPlanIds.subscribe(value => { planIds = Array.from(value); });

  onMount(async () => {
    // Wait a bit for stores to initialize
    setTimeout(async () => {
      await loadExistingReports();
    }, 100);
  });

  async function loadExistingReports() {
    try {
      const result = await apiService.getReports(llm, corpus);
      generatedReports = result.reports;
      reports.set(result.reports);
      reportsGenerated.set(generatedReports.length > 0);
      executionComplete = generatedReports.length > 0;
    } catch (err) {
      setError('Failed to load existing reports: ' + err.message);
    }
  }

  async function executeSearchPlans() {
    executing = true;
    executionComplete = false;
    executionLogs = [];
    setLoading(true);

    // Add initial log entry
    const planCount = planIds.length > 0 ? planIds.length : 'all';
    addLog('info', `Starting execution of ${planCount} search plan${planIds.length !== 1 ? 's' : ''}...`);

    try {
      const options = planIds.length > 0 ? { plan_ids: planIds } : {};
      const result = await apiService.executeSearchPlans(options, llm, corpus);

      addLog('success', `Execution completed! Generated ${result.reports.length} reports`);

      // Load the detailed reports
      await loadExistingReports();

      executionComplete = true;
      dispatch('completed', result);
      setError(null);
    } catch (err) {
      addLog('error', `Execution failed: ${err.message}`);
      setError('Failed to execute search plans: ' + err.message);
    } finally {
      executing = false;
      setLoading(false);
    }
  }

  async function reExecuteSearchPlans() {
    executing = true;
    executionLogs = [];
    setLoading(true);

    // Add initial log entry
    const planCount = planIds.length > 0 ? planIds.length : 'all';
    addLog('info', `Re-executing ${planCount} search plan${planIds.length !== 1 ? 's' : ''}...`);

    try {
      const options = planIds.length > 0 ? { plan_ids: planIds } : {};
      const result = await apiService.executeSearchPlans(options, llm, corpus);

      addLog('success', `Re-execution completed! Generated ${result.reports.length} reports`);

      // Load the detailed reports
      await loadExistingReports();

      dispatch('completed', result);
      setError(null);
    } catch (err) {
      addLog('error', `Re-execution failed: ${err.message}`);
      setError('Failed to re-execute search plans: ' + err.message);
    } finally {
      executing = false;
      setLoading(false);
    }
  }

  function addLog(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    executionLogs = [...executionLogs, { type, message, timestamp }];
  }

  function parseToolCalls(reportContent) {
    const debugSection = reportContent.split('=== SEARCH AGENT DEBUG LOG ===')[1];
    if (!debugSection) return [];

    const toolCalls = [];
    const lines = debugSection.split('\n');
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

<div class="search-execution">
  <div class="header">
    <h3>Search Execution</h3>
    <div class="header-right">
      {#if executionComplete}
        <button 
          class="re-execute-btn" 
          on:click={reExecuteSearchPlans}
          disabled={executing}
          title="Re-run search execution with existing plans"
        >
          {#if executing}
            Re-executing...
          {:else}
            Re-execute
          {/if}
        </button>
        <span class="status-badge success">Completed</span>
      {:else if executing}
        <span class="status-badge running">Running</span>
      {:else}
        <span class="status-badge pending">Ready</span>
      {/if}
    </div>
  </div>

  {#if !executionComplete}
    <div class="execution-settings">
      <h4>Search Plan Execution</h4>
      <p class="info-text">Execute your search plans to generate comprehensive reports. Vector database operations will use existing indexed documents.</p>

      <button 
        class="execute-btn" 
        on:click={executeSearchPlans}
        disabled={executing}
      >
        {#if executing}
          Executing Search Plans...
        {:else}
          Execute Search Plans
        {/if}
      </button>
    </div>
  {/if}

  {#if executionLogs.length > 0}
    <div class="execution-logs">
      <h4>Execution Log</h4>
      <div class="log-container">
        {#each executionLogs as log}
          <div class="log-entry {log.type}">
            <span class="timestamp">{log.timestamp}</span>
            <span class="message">{log.message}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if generatedReports.length > 0}
    <div class="reports-overview">
      <h4>Generated Reports ({generatedReports.length})</h4>
      
      {#each generatedReports as report, index}
        <div class="report-card">
          <div class="report-header">
            <h5>Report {index + 1}</h5>
            <span class="report-filename">{report.filename}</span>
          </div>
          
          <div class="report-content">
            {#if report.content.includes('=== SEARCH AGENT DEBUG LOG ===')}
              {@const parts = report.content.split('=== SEARCH AGENT DEBUG LOG ===')}
              {@const toolCalls = parseToolCalls(report.content)}
              
              <div class="report-summary">
                <h6>Report Summary</h6>
                <div class="summary-content">
                  <MarkdownRenderer
                    text={parts[0].trim()}
                    llm={llm}
                    corpusName={corpus}
                  />
                </div>
              </div>

              {#if toolCalls.length > 0}
                <div class="tool-calls">
                  <h6>Tool Calls ({toolCalls.length})</h6>
                  {#each toolCalls as toolCall, i}
                    <details class="tool-call">
                      <summary class="tool-call-header">
                        <span class="tool-call-id">{toolCall.id}</span>
                        <span class="function-name">{toolCall.function}</span>
                        <span class="expand-icon">▶</span>
                      </summary>

                      <div class="tool-call-details">
                        <div class="arguments">
                          <div class="detail-label">Arguments</div>
                          <pre class="code-block">{toolCall.arguments}</pre>
                        </div>

                        <div class="result">
                          <div class="detail-label">Result</div>
                          <pre class="code-block">{formatResult(toolCall.result)}</pre>
                        </div>
                      </div>
                    </details>
                  {/each}
                </div>
              {/if}
            {:else}
              <div class="report-full">
                <pre>{report.content}</pre>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      <div class="next-step">
        <button class="review-btn" on:click={() => dispatch('review')}>
          Review and Edit Reports
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .search-execution {
    max-width: 1000px;
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

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-badge {
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-badge.pending {
    background: #e3f2fd;
    color: #1976d2;
  }

  .status-badge.running {
    background: #fff3e0;
    color: #f57c00;
  }

  .status-badge.success {
    background: #e8f5e8;
    color: #4caf50;
  }

  .execution-settings {
    background: white;
    padding: 24px;
    border-radius: 8px;
    border: 1px solid #ddd;
    margin-bottom: 20px;
  }

  .execution-settings h4 {
    margin: 0 0 16px 0;
    color: #333;
  }

  .info-text {
    margin: 0 0 20px 0;
    color: #666;
    font-size: 14px;
    line-height: 1.4;
  }

  .settings-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }

  .setting-group label {
    display: block;
    margin-bottom: 4px;
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

  .execute-btn {
    background: #9c27b0;
    color: white;
    border: none;
    padding: 16px 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    width: 100%;
  }

  .execute-btn:hover:not(:disabled) {
    background: #7b1fa2;
  }

  .execute-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .re-execute-btn {
    background: #ff9800;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
  }

  .re-execute-btn:hover:not(:disabled) {
    background: #f57c00;
  }

  .re-execute-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .execution-logs {
    background: #1a1a1a;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .execution-logs h4 {
    margin: 0 0 12px 0;
    color: #fff;
    font-size: 14px;
  }

  .log-container {
    max-height: 300px;
    overflow-y: auto;
  }

  .log-entry {
    display: flex;
    gap: 12px;
    padding: 4px 0;
    font-family: 'Courier New', monospace;
    font-size: 13px;
  }

  .log-entry.info {
    color: #90cdf4;
  }

  .log-entry.success {
    color: #68d391;
  }

  .log-entry.error {
    color: #feb2b2;
  }

  .timestamp {
    color: #a0aec0;
    font-weight: 500;
    min-width: 80px;
  }

  .message {
    flex: 1;
  }

  .reports-overview {
    margin-top: 30px;
  }

  .reports-overview h4 {
    margin: 0 0 20px 0;
    color: #333;
  }

  .report-card {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    margin-bottom: 20px;
    overflow: hidden;
  }

  .report-header {
    background: #f8f9fa;
    padding: 16px 20px;
    border-bottom: 1px solid #e9ecef;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .report-header h5 {
    margin: 0;
    color: #333;
  }

  .report-filename {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #666;
  }

  .report-content {
    padding: 20px;
  }

  .report-summary h6,
  .tool-calls h6 {
    margin: 0 0 12px 0;
    color: #333;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .summary-content {
    background: white;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 20px;
    margin-bottom: 20px;
  }

  .summary-content pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .tool-calls {
    border-top: 1px solid #e9ecef;
    padding-top: 20px;
  }

  .tool-call {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .tool-call:hover {
    border-color: #1976d2;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .tool-call[open] {
    border-color: #1976d2;
  }

  .tool-call-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    user-select: none;
    list-style: none;
    position: relative;
  }

  .tool-call-header::-webkit-details-marker {
    display: none;
  }

  .tool-call-header:hover {
    background: linear-gradient(135deg, #5a67d8 0%, #6b3fa0 100%);
  }

  .tool-call-id {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .function-name {
    color: white;
    font-family: 'Courier New', Consolas, Monaco, monospace;
    font-size: 13px;
    font-weight: 600;
    flex: 1;
  }

  .expand-icon {
    color: white;
    font-size: 10px;
    transition: transform 0.2s ease;
    margin-left: auto;
  }

  .tool-call[open] .expand-icon {
    transform: rotate(90deg);
  }

  .tool-call-details {
    padding: 16px;
    background: #fafafa;
  }

  .arguments,
  .result {
    margin-bottom: 16px;
  }

  .arguments:last-child,
  .result:last-child {
    margin-bottom: 0;
  }

  .detail-label {
    display: block;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .code-block {
    margin: 0;
    font-family: 'Courier New', Consolas, Monaco, monospace;
    font-size: 12px;
    line-height: 1.5;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 300px;
    overflow-y: auto;
    color: #333;
  }

  .code-block::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .code-block::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  .code-block::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }

  .code-block::-webkit-scrollbar-thumb:hover {
    background: #555;
  }

  .report-full pre {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 4px;
    padding: 16px;
  }

  .next-step {
    margin-top: 30px;
    text-align: center;
  }

  .review-btn {
    background: #ff9800;
    color: white;
    border: none;
    padding: 16px 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    font-weight: 500;
  }

  .review-btn:hover {
    background: #f57c00;
  }
</style>