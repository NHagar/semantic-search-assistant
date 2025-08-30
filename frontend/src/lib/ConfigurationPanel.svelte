<script>
  import { onMount } from 'svelte';
  import { selectedLLM, corpusName, isResuming, resumeStages } from './stores.js';
  import { apiService } from './api.js';

  let llmValue = 'qwen/qwen3-14b';
  let corpusValue = '';
  let existingCombinations = [];
  let selectedExisting = '';
  let useExisting = "false";
  let loadingCombinations = false;

  // Subscribe to store changes
  selectedLLM.subscribe(value => {
    if (value) llmValue = value;
  });

  corpusName.subscribe(value => {
    corpusValue = value || '';
  });

  // Initialize stores on mount
  onMount(async () => {
    selectedLLM.set(llmValue);
    corpusName.set(corpusValue);
    await loadExistingCombinations();
  });

  async function loadExistingCombinations() {
    loadingCombinations = true;
    try {
      const result = await apiService.getExistingCombinations();
      existingCombinations = result.combinations || [];
    } catch (err) {
      console.error('Failed to load existing combinations:', err);
      existingCombinations = [];
    }
    loadingCombinations = false;
  }

  // Update stores when inputs change
  function updateLLM() {
    selectedLLM.set(llmValue);
  }

  function updateCorpusName() {
    corpusName.set(corpusValue);
  }

  function toggleMode() {
    const isResumeMode = useExisting === "true";
    
    // Update resume state
    isResuming.set(isResumeMode);
    
    if (isResumeMode && selectedExisting) {
      selectExistingCombination();
    } else if (!isResumeMode) {
      // Reset to new project defaults
      resumeStages.set({
        description: false,
        plans: false,
        reports: false,
        final: false
      });
    }
  }

  function selectExistingCombination() {
    if (selectedExisting) {
      const combination = existingCombinations.find(c => 
        `${c.corpus_name}|${c.model_name}` === selectedExisting
      );
      if (combination) {
        llmValue = combination.model_name;
        corpusValue = combination.corpus_name;
        selectedLLM.set(llmValue);
        corpusName.set(corpusValue);
        
        // Set resume stages based on what's already completed
        isResuming.set(true);
        resumeStages.set(combination.stages);
      }
    }
  }

  function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function getStageIcon(stage) {
    return stage ? '✅' : '⭕';
  }

  function getStageText(stages) {
    const completed = Object.values(stages).filter(Boolean).length;
    const total = Object.keys(stages).length;
    return `${completed}/${total} stages complete`;
  }
</script>

<div class="config-panel">
  <h3>Configuration</h3>
  
  <!-- Mode Selection -->
  <div class="mode-selection">
    <label class="mode-option">
      <input
        type="radio"
        bind:group={useExisting}
        value="false"
        on:change={toggleMode}
      />
      <span>Start New Project</span>
    </label>
    <label class="mode-option">
      <input
        type="radio"
        bind:group={useExisting}
        value="true"
        on:change={toggleMode}
      />
      <span>Resume Existing Project</span>
    </label>
  </div>

  {#if useExisting === "true"}
    <!-- Existing Combinations -->
    <div class="existing-section">
      <h4>Select Existing Project</h4>
      {#if loadingCombinations}
        <div class="loading">Loading existing projects...</div>
      {:else if existingCombinations.length === 0}
        <div class="empty-state">
          <p>No existing projects found. Switch to "Start New Project" to create one.</p>
        </div>
      {:else}
        <div class="combinations-list">
          {#each existingCombinations as combination}
            <label class="combination-option">
              <input
                type="radio"
                bind:group={selectedExisting}
                value={`${combination.corpus_name}|${combination.model_name}`}
                on:change={selectExistingCombination}
              />
              <div class="combination-info">
                <div class="combination-header">
                  <span class="combination-name">{combination.display_name}</span>
                  <span class="combination-date">{formatDate(combination.last_modified)}</span>
                </div>
                <div class="combination-stages">
                  <span class="stages-text">{getStageText(combination.stages)}</span>
                  <div class="stages-icons">
                    <span title="Description">{getStageIcon(combination.stages.description)}</span>
                    <span title="Search Plans">{getStageIcon(combination.stages.plans)}</span>
                    <span title="Reports">{getStageIcon(combination.stages.reports)}</span>
                    <span title="Final Report">{getStageIcon(combination.stages.final)}</span>
                  </div>
                </div>
                <div class="combination-meta">
                  {combination.file_count} files
                </div>
              </div>
            </label>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- New Project Configuration -->
    <div class="config-grid">
      <div class="config-item">
        <label for="llm-select">Language Model</label>
        <input
          id="llm-select"
          type="text"
          bind:value={llmValue}
          on:input={updateLLM}
          placeholder="e.g., gpt-4, claude-3-sonnet-20241022, qwen/qwen3-14b"
          class="config-input"
        />
        <p class="config-help">
          Specify the LLM model to use for analysis and search operations.
        </p>
      </div>

      <div class="config-item">
        <label for="corpus-name">Corpus Name</label>
        <input
          id="corpus-name"
          type="text"
          bind:value={corpusValue}
          on:input={updateCorpusName}
          placeholder="e.g., climate-ai-research, legal-docs-2024"
          class="config-input"
        />
        <p class="config-help">
          Name for this document collection. Used to organize output files.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .config-panel {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .config-panel h3 {
    margin: 0 0 20px 0;
    color: #495057;
    font-size: 18px;
    font-weight: 600;
  }

  .config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  .config-item {
    display: flex;
    flex-direction: column;
  }

  .config-item label {
    font-weight: 500;
    margin-bottom: 8px;
    color: #495057;
  }

  .config-input {
    padding: 12px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 14px;
    transition: border-color 0.2s ease;
  }

  .config-input:focus {
    outline: none;
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
  }

  .config-help {
    font-size: 12px;
    color: #6c757d;
    margin: 4px 0 0 0;
    line-height: 1.4;
  }

  .mode-selection {
    display: flex;
    gap: 24px;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #dee2e6;
  }

  .mode-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 500;
  }

  .mode-option input[type="radio"] {
    margin: 0;
  }

  .existing-section h4 {
    margin: 0 0 16px 0;
    color: #495057;
    font-size: 16px;
  }

  .loading, .empty-state {
    text-align: center;
    padding: 32px 16px;
    color: #6c757d;
    font-style: italic;
  }

  .combinations-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 300px;
    overflow-y: auto;
  }

  .combination-option {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .combination-option:hover {
    border-color: #2196f3;
    background-color: #f8f9ff;
  }

  .combination-option input[type="radio"] {
    margin-top: 4px;
    flex-shrink: 0;
  }

  .combination-info {
    flex: 1;
    min-width: 0;
  }

  .combination-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
    gap: 12px;
  }

  .combination-name {
    font-weight: 600;
    color: #495057;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combination-date {
    font-size: 12px;
    color: #6c757d;
    flex-shrink: 0;
  }

  .combination-stages {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .stages-text {
    font-size: 12px;
    color: #6c757d;
  }

  .stages-icons {
    display: flex;
    gap: 4px;
    font-size: 14px;
  }

  .combination-meta {
    font-size: 12px;
    color: #868e96;
  }

  @media (max-width: 768px) {
    .config-grid {
      grid-template-columns: 1fr;
      gap: 20px;
    }

    .mode-selection {
      flex-direction: column;
      gap: 12px;
    }

    .combination-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }

    .combination-stages {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
  }
</style>