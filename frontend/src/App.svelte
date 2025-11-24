<script>
  import { onMount } from "svelte";
  import {
    currentStep,
    loading,
    error,
    setError,
    projectSelected,
    currentProject,
    selectedPlanIds,
  } from "./lib/stores.js";
  import { apiService } from "./lib/api.js";

  // Components
  import ProjectManager from "./lib/ProjectManager.svelte";
  import DocumentUploadEditor from "./lib/DocumentUploadEditor.svelte";
  import DocumentDescription from "./lib/DocumentDescription.svelte";
  import SearchPlans from "./lib/SearchPlans.svelte";
  import SearchExecution from "./lib/SearchExecution.svelte";
  import ReportsViewer from "./lib/ReportsViewer.svelte";

  let currentStepValue = 0;
  let isLoading = false;
  let errorMessage = null;
  let apiHealthy = false;
  let hasProjectSelected = false;
  let project = null;

  // Subscribe to store changes
  currentStep.subscribe((value) => {
    currentStepValue = value;
  });

  loading.subscribe((value) => {
    isLoading = value;
  });

  error.subscribe((value) => {
    errorMessage = value;
  });

  projectSelected.subscribe((value) => {
    hasProjectSelected = value;
  });

  currentProject.subscribe((value) => {
    project = value;
  });

  onMount(async () => {
    await checkApiHealth();
  });

  async function checkApiHealth() {
    try {
      await apiService.healthCheck();
      apiHealthy = true;
    } catch (err) {
      apiHealthy = false;
      setError(
        "Backend API is not available. Please make sure the Python server is running.",
      );
    }
  }


  function nextStep() {
    if (currentStepValue < 4) {
      currentStep.set(currentStepValue + 1);
    }
  }

  function prevStep() {
    if (currentStepValue > 0) {
      currentStep.set(currentStepValue - 1);
    }
  }

  function handleDocumentsExtracted(event) {
    console.log("Documents extracted:", event.detail);
    currentStep.set(1);
  }

  function handleDescriptionGenerated(event) {
    console.log("Description generated:", event.detail);
  }

  function handleDescriptionSaved(event) {
    console.log("Description saved:", event.detail);
  }

  function handlePlansGenerated(event) {
    console.log("Search plans generated:", event.detail);
  }

  function handlePlansSaved(event) {
    console.log("Search plan saved:", event.detail);
  }

  function handleExecutePlans(event) {
    const planIds = event?.detail?.selectedPlanIds || [];
    selectedPlanIds.set(new Set(planIds));
    currentStep.set(3);
  }

  function handleExecutionCompleted(event) {
    console.log("Execution completed:", event.detail);
    currentStep.set(4);
  }

  function handleReviewReports() {
    currentStep.set(4);
  }

  function handleReportSaved(event) {
    console.log("Report saved:", event.detail);
  }

  function handleReportRegenerated(event) {
    console.log("Report regenerated:", event.detail);
  }

  function dismissError() {
    error.set(null);
  }

  function handleProjectSelected(projectData) {
    currentProject.set(projectData);
    projectSelected.set(true);

    // Determine initial step based on project progress
    if (projectData.isNew) {
      currentStep.set(0);
    } else {
      const { stages, has_vector_db } = projectData;

      // Determine which step to start on based on progress
      if (!has_vector_db) {
        currentStep.set(0);
      } else if (!stages?.description) {
        currentStep.set(1);
      } else if (!stages?.plans) {
        currentStep.set(2);
      } else if (!stages?.reports) {
        currentStep.set(3);
      } else {
        currentStep.set(4);
      }
    }
  }

  function backToProjectSelection() {
    projectSelected.set(false);
    currentProject.set(null);
    currentStep.set(0);
  }
</script>

<main class="app">
  {#if hasProjectSelected}
    <header class="app-header">
      <div class="header-content">
        <div>
          <h1>Semantic Search Assistant</h1>
          <p>AI-powered document research and analysis platform</p>
          {#if project}
            <div class="project-info">
              <strong>{project.corpus_name}</strong> ({project.model_name})
              <button class="change-project-btn" on:click={backToProjectSelection}>
                Change Project
              </button>
            </div>
          {/if}
        </div>

        {#if !apiHealthy}
          <div class="api-status error">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            API Disconnected
          </div>
        {:else}
          <div class="api-status healthy">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22,4 12,14.01 9,11.01" />
            </svg>
            API Connected
          </div>
        {/if}
      </div>
    </header>
  {/if}

  {#if errorMessage}
    <div class="error-banner">
      <div class="error-content">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>{errorMessage}</span>
        <button class="dismiss-btn" on:click={dismissError}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  {#if isLoading}
    <div class="loading-banner">
      <div class="loading-content">
        <div class="spinner"></div>
        <span>Processing...</span>
      </div>
    </div>
  {/if}

  {#if !hasProjectSelected}
    <!-- Project Selection/Creation Screen -->
    <ProjectManager onProjectSelected={handleProjectSelected} />
  {:else}
    <!-- Project View -->
    <div class="app-content">
      <div class="project-layout">
        <div class="step-content">
      {#if currentStepValue === 0}
        <div class="step-panel">
          <h2>Upload Documents</h2>
          <p>Upload PDF documents, review and edit extracted text, then embed them for semantic search.</p>

          <DocumentUploadEditor on:extracted={handleDocumentsExtracted} />
        </div>
      {:else if currentStepValue === 1}
        <div class="step-panel">
          <h2>Document Description</h2>
          <p>
            Generate and optionally edit a description of your document corpus.
          </p>
          <DocumentDescription
            on:generated={handleDescriptionGenerated}
            on:saved={handleDescriptionSaved}
          />
          <div class="navigation-buttons">
            <button class="nav-btn secondary" on:click={prevStep}
              >Previous</button
            >
            <button class="nav-btn primary" on:click={nextStep}>Continue</button
            >
          </div>
        </div>
      {:else if currentStepValue === 2}
        <div class="step-panel">
          <h2>Comprehensive Search Plans</h2>
          <p>
            Generate comprehensive search plans to systematically analyze your entire document corpus and edit them as needed.
          </p>
          <SearchPlans
            on:generated={handlePlansGenerated}
            on:saved={handlePlansSaved}
            on:execute={handleExecutePlans}
          />
          <div class="navigation-buttons">
            <button class="nav-btn secondary" on:click={prevStep}
              >Previous</button
            >
          </div>
        </div>
      {:else if currentStepValue === 3}
        <div class="step-panel">
          <h2>Execute Search</h2>
          <p>
            Run the search agents and monitor their tool calls and progress.
          </p>
          <SearchExecution
            on:completed={handleExecutionCompleted}
            on:review={handleReviewReports}
          />
          <div class="navigation-buttons">
            <button class="nav-btn secondary" on:click={prevStep}
              >Previous</button
            >
          </div>
        </div>
      {:else if currentStepValue === 4}
        <div class="step-panel">
          <h2>Review Reports</h2>
          <p>
            View and edit the generated search reports.
          </p>
          <ReportsViewer
            on:saved={handleReportSaved}
            on:regenerated={handleReportRegenerated}
          />
          <div class="navigation-buttons">
            <button class="nav-btn secondary" on:click={prevStep}
              >Previous</button
            >
          </div>
        </div>
      {/if}
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background-color: #f5f7fa;
    color: #333;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 24px 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  .header-content h1 {
    margin: 0 0 4px 0;
    font-size: 28px;
    font-weight: 700;
  }

  .header-content p {
    margin: 0;
    opacity: 0.9;
    font-size: 14px;
  }

  .project-info {
    margin-top: 8px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0.95;
  }

  .change-project-btn {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .change-project-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .api-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .api-status.healthy {
    background: rgba(76, 175, 80, 0.2);
    color: #4caf50;
    border: 1px solid rgba(76, 175, 80, 0.3);
  }

  .api-status.error {
    background: rgba(244, 67, 54, 0.2);
    color: #f44336;
    border: 1px solid rgba(244, 67, 54, 0.3);
  }

  .error-banner {
    background: #ffebee;
    border-bottom: 1px solid #ffcdd2;
    padding: 12px 0;
  }

  .error-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #c62828;
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: #c62828;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    margin-left: auto;
  }

  .dismiss-btn:hover {
    background: rgba(198, 40, 40, 0.1);
  }

  .loading-banner {
    background: #e3f2fd;
    border-bottom: 1px solid #bbdefb;
    padding: 12px 0;
  }

  .loading-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    color: #1976d2;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #bbdefb;
    border-top: 2px solid #1976d2;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .app-content {
    flex: 1;
    width: 100%;
    padding: 40px 20px 64px;
  }

  .project-layout {
    max-width: 1200px;
    margin: 0 auto;
  }


  .step-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .step-panel {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
    padding: 32px;
  }

  .step-panel h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    color: #2c3e50;
  }

  .step-panel > p {
    margin: 0 0 32px 0;
    color: #666;
    font-size: 16px;
    line-height: 1.5;
  }

  .navigation-buttons {
    display: flex;
    justify-content: space-between;
    margin-top: 40px;
    padding-top: 24px;
    border-top: 1px solid #e9ecef;
  }

  .nav-btn {
    padding: 12px 24px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: background-color 0.2s ease;
  }

  .nav-btn.primary {
    background: #2196f3;
    color: white;
  }

  .nav-btn.primary:hover {
    background: #1976d2;
  }

  .nav-btn.secondary {
    background: #6c757d;
    color: white;
  }

  .nav-btn.secondary:hover {
    background: #5a6268;
  }

  @media (max-width: 768px) {
    .header-content {
      text-align: center;
    }

    .header-content h1 {
      font-size: 24px;
    }

    .step-panel {
      padding: 24px;
    }
  }

</style>
