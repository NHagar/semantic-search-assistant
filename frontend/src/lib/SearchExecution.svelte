<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { reports, reportsGenerated, setError, setLoading } from './stores.js';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  
  let executing = false;
  let executionLogs = [];
  let chunkSize = 1024;
  let overlap = 20;
  let executionComplete = false;
  let generatedReports = [];

  // Subscribe to store changes
  reports.subscribe(value => {
    generatedReports = value;
  });

  onMount(async () => {
    await loadExistingReports();
  });

  async function loadExistingReports() {
    try {
      const result = await apiService.getReports();
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
    addLog('info', 'Starting search plan execution...');
    addLog('info', `Configuration: chunk_size=${chunkSize}, overlap=${overlap}`);
    
    try {
      const result = await apiService.executeSearchPlans({
        chunk_size: chunkSize,
        overlap: overlap
      });
      
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
    {#if executionComplete}
      <span class="status-badge success">Completed</span>
    {:else if executing}
      <span class="status-badge running">Running</span>
    {:else}
      <span class="status-badge pending">Ready</span>
    {/if}
  </div>

  {#if !executionComplete}
    <div class="execution-settings">
      <h4>Vector Database Settings</h4>
      
      <div class="settings-row">
        <div class="setting-group">
          <label for="chunkSize">Chunk Size:</label>
          <input 
            id="chunkSize"
            type="number" 
            bind:value={chunkSize} 
            min="256" 
            max="4096"
            disabled={executing}
          />
          <small>Size of text chunks for vector search</small>
        </div>

        <div class="setting-group">
          <label for="overlap">Overlap:</label>
          <input 
            id="overlap"
            type="number" 
            bind:value={overlap} 
            min="0" 
            max="100"
            disabled={executing}
          />
          <small>Overlap between adjacent chunks</small>
        </div>
      </div>

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
                  <pre>{parts[0].trim()}</pre>
                </div>
              </div>

              {#if toolCalls.length > 0}
                <div class="tool-calls">
                  <h6>Tool Calls ({toolCalls.length})</h6>
                  {#each toolCalls as toolCall, i}
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
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 4px;
    padding: 16px;
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
    font-size: 12px;
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
    max-height: 200px;
    overflow-y: auto;
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