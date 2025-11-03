<script>
  import { onMount } from "svelte";
  import {
    currentStep,
    steps,
    loading,
    error,
    setError,
    projectSelected,
    currentProject,
    stepStatuses,
    STEP_STATUS,
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
  import FinalReport from "./lib/FinalReport.svelte";

  let currentStepValue = 0;
  let isLoading = false;
  let errorMessage = null;
  let apiHealthy = false;
  let hasProjectSelected = false;
  let project = null;
  let stepStatusValues = [];

  const STATUS_LABELS = {
    [STEP_STATUS.NOT_STARTED]: "Not started",
    [STEP_STATUS.IN_PROGRESS]: "In progress",
    [STEP_STATUS.COMPLETED]: "Completed",
    [STEP_STATUS.NEEDS_UPDATE]: "Needs rerun",
  };

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

  stepStatuses.subscribe((value) => {
    stepStatusValues = value;
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

  function initializeWorkflowState() {
    stepStatuses.set(
      steps.map((_, index) =>
        index === 0 ? STEP_STATUS.IN_PROGRESS : STEP_STATUS.NOT_STARTED,
      ),
    );
    currentStep.set(0);
  }

  function initializeWorkflowStateFromProject(projectData) {
    // Map backend stages to frontend step statuses
    const { stages, has_vector_db } = projectData;
    const newStatuses = [...steps.map(() => STEP_STATUS.NOT_STARTED)];

    // Step 0: Upload Documents - completed if vector DB exists
    if (has_vector_db) {
      newStatuses[0] = STEP_STATUS.COMPLETED;
    } else {
      newStatuses[0] = STEP_STATUS.IN_PROGRESS;
    }

    // Step 1: Document Description - completed if description exists
    if (stages?.description) {
      newStatuses[1] = STEP_STATUS.COMPLETED;
    }

    // Step 2: Search Plans - completed if plans exist
    if (stages?.plans) {
      newStatuses[2] = STEP_STATUS.COMPLETED;
    }

    // Step 3: Execute Search - completed if reports exist
    if (stages?.reports) {
      newStatuses[3] = STEP_STATUS.COMPLETED;

      // Step 4: Review Reports - only mark as completed if final report also exists
      // This gives users a chance to review reports before synthesizing
      if (stages?.final) {
        newStatuses[4] = STEP_STATUS.COMPLETED;
      }
    }

    // Step 5: Final Report - completed if final report exists
    if (stages?.final) {
      newStatuses[5] = STEP_STATUS.COMPLETED;
    }

    stepStatuses.set(newStatuses);

    // Determine which step to start on based on progress
    let initialStep = 0;

    // Find the first incomplete step
    for (let i = 0; i < newStatuses.length; i++) {
      if (newStatuses[i] !== STEP_STATUS.COMPLETED) {
        initialStep = i;
        break;
      }
    }

    // If all steps are completed, go to the last step
    if (newStatuses.every(status => status === STEP_STATUS.COMPLETED)) {
      initialStep = steps.length - 1;
    }

    currentStep.set(initialStep);

    // Mark the initial step as in-progress if it's not completed
    if (newStatuses[initialStep] !== STEP_STATUS.COMPLETED) {
      startStep(initialStep);
    }
  }

  function resetWorkflowState() {
    stepStatuses.set(steps.map(() => STEP_STATUS.NOT_STARTED));
    currentStep.set(0);
  }

  function startStep(stepIndex) {
    stepStatuses.update((statuses) => {
      const updated = [...statuses];

      if (stepIndex >= 0 && stepIndex < updated.length) {
        if (updated[stepIndex] !== STEP_STATUS.COMPLETED) {
          updated[stepIndex] = STEP_STATUS.IN_PROGRESS;
        }
      }

      return updated;
    });
  }

  function completeStep(stepIndex) {
    stepStatuses.update((statuses) => {
      const updated = [...statuses];

      if (stepIndex >= 0 && stepIndex < updated.length) {
        updated[stepIndex] = STEP_STATUS.COMPLETED;
      }

      return updated;
    });
  }

  function markDownstreamNeedsUpdate(startIndex) {
    stepStatuses.update((statuses) => {
      const updated = [...statuses];

      for (let index = startIndex; index < updated.length; index += 1) {
        if (updated[index] === STEP_STATUS.COMPLETED) {
          updated[index] = STEP_STATUS.NEEDS_UPDATE;
        }
      }

      return updated;
    });
  }

  function getStepStatus(stepIndex) {
    return stepStatusValues[stepIndex] ?? STEP_STATUS.NOT_STARTED;
  }

  function nextStep() {
    // Normal linear progression
    if (currentStepValue < steps.length - 1) {
      const currentIndex = currentStepValue;
      const nextIndex = currentIndex + 1;

      completeStep(currentIndex);
      currentStep.set(nextIndex);
      startStep(nextIndex);
    }
  }

  function prevStep() {
    if (currentStepValue > 0) {
      const previousIndex = currentStepValue - 1;
      currentStep.set(previousIndex);
      startStep(previousIndex);
    }
  }

  function goToStep(stepIndex) {
    if (stepIndex >= 0 && stepIndex < steps.length) {
      currentStep.set(stepIndex);
      startStep(stepIndex);
    }
  }

  function handleDocumentsExtracted(event) {
    console.log("Documents extracted:", event.detail);
    completeStep(0);
    markDownstreamNeedsUpdate(1);

    const nextIndex = Math.min(1, steps.length - 1);
    currentStep.set(nextIndex);
    startStep(nextIndex);
  }

  function handleDescriptionGenerated(event) {
    console.log("Description generated:", event.detail);
    // Stay on the same step to allow editing
    startStep(1);
    markDownstreamNeedsUpdate(2);
  }

  function handleDescriptionSaved(event) {
    console.log("Description saved:", event.detail);
    // Stay on the same step
    completeStep(1);
    markDownstreamNeedsUpdate(2);
  }

  function handlePlansGenerated(event) {
    console.log("Search plans generated:", event.detail);
    // Stay on the same step to allow editing
    startStep(2);
    markDownstreamNeedsUpdate(3);
  }

  function handlePlansSaved(event) {
    console.log("Search plan saved:", event.detail);
    // Stay on the same step
    completeStep(2);
    markDownstreamNeedsUpdate(3);
  }

  function handleExecutePlans(event) {
    const planIds = event?.detail?.selectedPlanIds || [];
    // Store selected plan IDs for use in SearchExecution
    selectedPlanIds.set(new Set(planIds));
    completeStep(2);
    markDownstreamNeedsUpdate(3);
    currentStep.set(3);
    startStep(3);
  }

  function handleExecutionCompleted(event) {
    console.log("Execution completed:", event.detail);
    completeStep(3);
    markDownstreamNeedsUpdate(4);
    currentStep.set(4);
    startStep(4);
  }

  function handleReviewReports() {
    currentStep.set(4);
    startStep(4);
  }

  function handleReportSaved(event) {
    console.log("Report saved:", event.detail);
    // Stay on the same step
    completeStep(4);
    markDownstreamNeedsUpdate(5);
  }

  function handleReportRegenerated(event) {
    console.log("Report regenerated:", event.detail);
    // Stay on the same step
    startStep(4);
    markDownstreamNeedsUpdate(5);
  }

  function handleSynthesizeReport() {
    completeStep(4);
    markDownstreamNeedsUpdate(5);
    currentStep.set(5);
    startStep(5);
  }

  function handleFinalReportGenerated(event) {
    console.log("Final report generated:", event.detail);
    // Stay on the same step
    startStep(5);
  }

  function handleFinalReportSaved(event) {
    console.log("Final report saved:", event.detail);
    // Stay on the same step
    completeStep(5);
  }

  function dismissError() {
    error.set(null);
  }

  function handleProjectSelected(projectData) {
    // Update stores with project information
    currentProject.set(projectData);
    projectSelected.set(true);

    // Initialize workflow state based on actual project progress
    // For new projects, this will start at step 0
    // For existing projects, this will resume from the appropriate step
    if (projectData.isNew) {
      initializeWorkflowState();
    } else {
      initializeWorkflowStateFromProject(projectData);
    }
  }

  function backToProjectSelection() {
    projectSelected.set(false);
    currentProject.set(null);
    resetWorkflowState();
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
    <!-- Project Workflow -->
    <div class="app-content">
      <div class="workflow-layout">
        <aside class="workflow-sidebar">
          <div class="workflow-header">
            <h2>Project workflow</h2>
            <p>Track each stage and see when downstream steps need attention.</p>
          </div>
          <ul class="workflow-steps">
            {#each steps as step, index (step.id)}
              <li
                class="workflow-step"
                class:active={index === currentStepValue}
                class:completed={getStepStatus(index) === STEP_STATUS.COMPLETED}
                class:in-progress={getStepStatus(index) === STEP_STATUS.IN_PROGRESS}
                class:needs-update={getStepStatus(index) === STEP_STATUS.NEEDS_UPDATE}
                class:not-started={getStepStatus(index) === STEP_STATUS.NOT_STARTED}
              >
                <button
                  type="button"
                  class="workflow-step-btn"
                  on:click={() => goToStep(index)}
                >
                  <div class="step-header">
                    <span class="step-index">Step {index + 1}</span>
                    <span class={`status-pill status-${getStepStatus(index)}`}>
                      {#if getStepStatus(index) === STEP_STATUS.COMPLETED}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                        >
                          <polyline points="20,6 10,16 5,11" />
                        </svg>
                      {:else if getStepStatus(index) === STEP_STATUS.IN_PROGRESS}
                        <span class="status-dot status-dot-active"></span>
                      {:else if getStepStatus(index) === STEP_STATUS.NEEDS_UPDATE}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.4"
                        >
                          <path d="M12 9v4" />
                          <circle cx="12" cy="17" r="1" />
                          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                        </svg>
                      {:else}
                        <span class="status-dot"></span>
                      {/if}
                      {STATUS_LABELS[getStepStatus(index)]}
                    </span>
                  </div>
                  <div class="workflow-step-title">{step.title}</div>
                  <div class="workflow-step-description">{step.description}</div>
                </button>
              </li>
            {/each}
          </ul>
        </aside>

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
            View and edit the generated search reports before creating the final
            synthesis.
          </p>
          <ReportsViewer
            on:saved={handleReportSaved}
            on:regenerated={handleReportRegenerated}
            on:synthesize={handleSynthesizeReport}
          />
          <div class="navigation-buttons">
            <button class="nav-btn secondary" on:click={prevStep}
              >Previous</button
            >
          </div>
        </div>
      {:else if currentStepValue === 5}
        <div class="step-panel">
          <h2>Final Report</h2>
          <p>
            Generate and optionally edit your comprehensive final research
            report.
          </p>
          <FinalReport
            on:generated={handleFinalReportGenerated}
            on:saved={handleFinalReportSaved}
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

  .workflow-layout {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
    gap: 32px;
    align-items: flex-start;
  }

  .workflow-sidebar {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
    padding: 24px 20px;
    position: sticky;
    top: 24px;
  }

  .workflow-header h2 {
    margin: 0;
    font-size: 20px;
    color: #0f172a;
    letter-spacing: -0.01em;
  }

  .workflow-header p {
    margin: 8px 0 0;
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
  }

  .workflow-steps {
    list-style: none;
    margin: 28px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .workflow-step {
    position: relative;
    padding-left: 40px;
    --dot-color: #cbd5f5;
    --line-color: rgba(148, 163, 184, 0.3);
  }

  .workflow-step::before {
    content: "";
    position: absolute;
    left: 18px;
    top: -20px;
    bottom: -30px;
    width: 2px;
    background: var(--line-color);
  }

  .workflow-step:first-child::before {
    top: 24px;
  }

  .workflow-step:last-child::before {
    display: none;
  }

  .workflow-step::after {
    content: "";
    position: absolute;
    left: 9px;
    top: 18px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--dot-color);
    border: 3px solid #ffffff;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.16);
  }

  .workflow-step.completed {
    --dot-color: #22c55e;
    --line-color: rgba(34, 197, 94, 0.6);
  }

  .workflow-step.in-progress {
    --dot-color: #2563eb;
    --line-color: rgba(37, 99, 235, 0.55);
  }

  .workflow-step.needs-update {
    --dot-color: #f97316;
    --line-color: rgba(249, 115, 22, 0.55);
  }

  .workflow-step.active:not(.completed):not(.needs-update) {
    --dot-color: #2563eb;
    --line-color: rgba(37, 99, 235, 0.55);
  }

  .workflow-step-btn {
    width: 100%;
    background: #ffffff;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    padding: 16px 18px;
    text-align: left;
    transition: background 0.2s ease, box-shadow 0.2s ease,
      transform 0.2s ease, border-color 0.2s ease;
    cursor: pointer;
  }

  .workflow-step-btn:hover {
    background: #f8fafc;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
    transform: translateX(2px);
  }

  .workflow-step.completed .workflow-step-btn {
    border-color: rgba(34, 197, 94, 0.35);
    background: #f0fdf4;
  }

  .workflow-step.needs-update .workflow-step-btn {
    border-color: rgba(249, 115, 22, 0.35);
    background: #fff7ed;
  }

  .workflow-step.active .workflow-step-btn {
    border-color: rgba(37, 99, 235, 0.4);
    box-shadow: 0 14px 32px rgba(37, 99, 235, 0.15);
  }

  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .step-index {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    color: #64748b;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
    white-space: nowrap;
  }

  .status-pill svg {
    display: block;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
  }

  .status-dot-active {
    background: #2563eb;
  }

  .status-pill.status-in-progress {
    background: rgba(37, 99, 235, 0.18);
    color: #1d4ed8;
  }

  .status-pill.status-completed {
    background: rgba(34, 197, 94, 0.18);
    color: #15803d;
  }

  .status-pill.status-needs-update {
    background: rgba(249, 115, 22, 0.2);
    color: #c2410c;
  }

  .status-pill.status-not-started {
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
  }

  .workflow-step-title {
    font-size: 18px;
    font-weight: 600;
    color: #0f172a;
    margin: 0 0 4px;
  }

  .workflow-step-description {
    font-size: 13px;
    color: #64748b;
    margin: 0;
    line-height: 1.6;
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

  @media (max-width: 1024px) {
    .workflow-layout {
      grid-template-columns: 1fr;
      gap: 24px;
    }

    .workflow-sidebar {
      position: static;
    }
  }

  @media (max-width: 768px) {
    .header-content {
      text-align: center;
    }

    .header-content h1 {
      font-size: 24px;
    }

    .workflow-sidebar {
      padding: 20px 16px;
    }

    .workflow-step {
      padding-left: 32px;
    }

    .workflow-step::before {
      left: 14px;
    }

    .workflow-step::after {
      left: 5px;
    }

    .workflow-step-btn {
      padding: 14px 16px;
    }

    .workflow-step-title {
      font-size: 16px;
    }

    .step-panel {
      padding: 24px;
    }
  }

  .resume-info {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 24px;
    margin-top: 24px;
  }

  .resume-info h4 {
    margin: 0 0 16px 0;
    color: #495057;
  }

  .stage-status {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .stage {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
  }

  .stage.complete {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    color: #155724;
  }

  .stage.incomplete {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    color: #721c24;
  }

  .stage-icon {
    font-size: 16px;
  }

  .stage-name {
    font-weight: 500;
  }

  .resume-help {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: #6c757d;
    font-style: italic;
  }

  .resume-navigation {
    display: flex;
    justify-content: flex-end;
  }
</style>
