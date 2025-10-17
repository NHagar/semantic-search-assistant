<script>
  import { onMount } from 'svelte';
  import { selectedLLM, corpusName } from './stores.js';
  import { apiService } from './api.js';

  export let onProjectSelected;

  let existingProjects = [];
  let loading = true;
  let error = null;

  // New project form
  let newProjectName = '';
  let newProjectLLM = 'qwen/qwen3-14b';
  let creatingProject = false;

  // Available LLM models
  const availableLLMs = [
    'qwen/qwen3-14b',
    'gpt-4',
    'gpt-3.5-turbo',
    'claude-3-opus',
    'claude-3-sonnet'
  ];

  onMount(async () => {
    await loadProjects();
  });

  async function loadProjects() {
    loading = true;
    error = null;
    try {
      const response = await apiService.getExistingCombinations();
      existingProjects = response.combinations || [];
    } catch (err) {
      error = 'Failed to load projects: ' + err.message;
      console.error('Error loading projects:', err);
    } finally {
      loading = false;
    }
  }

  function selectProject(project) {
    selectedLLM.set(project.model_name);
    corpusName.set(project.corpus_name);
    onProjectSelected(project);
  }

  function createNewProject() {
    if (!newProjectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    creatingProject = true;

    // Set the project parameters
    selectedLLM.set(newProjectLLM);
    corpusName.set(newProjectName.trim());

    // Notify parent component
    onProjectSelected({
      corpus_name: newProjectName.trim(),
      model_name: newProjectLLM,
      isNew: true
    });

    creatingProject = false;
  }

  function getStageProgress(stages) {
    const total = 4;
    const completed = Object.values(stages).filter(v => v).length;
    return Math.round((completed / total) * 100);
  }

  function getStageText(stages) {
    if (stages.final) return 'Completed';
    if (stages.reports) return 'Reports generated';
    if (stages.plans) return 'Plans created';
    if (stages.description) return 'Description generated';
    return 'Just started';
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  async function deleteProject(project, event) {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete the project "${project.corpus_name}" (${project.model_name})?\n\nThis will remove all associated files and cannot be undone.`)) {
      // TODO: Implement delete endpoint
      alert('Delete functionality coming soon');
    }
  }
</script>

<div class="project-manager">
  <div class="header">
    <h1>Semantic Search Assistant</h1>
    <p class="subtitle">Select a project or create a new one to get started</p>
  </div>

  <div class="content">
    <!-- Create New Project Section -->
    <div class="section new-project-section">
      <h2>Create New Project</h2>
      <div class="new-project-form">
        <div class="form-group">
          <label for="project-name">Project Name</label>
          <input
            id="project-name"
            type="text"
            bind:value={newProjectName}
            placeholder="e.g., climate-legal-docs"
            disabled={creatingProject}
          />
        </div>

        <div class="form-group">
          <label for="llm-select">LLM Model</label>
          <select id="llm-select" bind:value={newProjectLLM} disabled={creatingProject}>
            {#each availableLLMs as llm}
              <option value={llm}>{llm}</option>
            {/each}
          </select>
        </div>

        <button
          class="create-button"
          on:click={createNewProject}
          disabled={creatingProject || !newProjectName.trim()}
        >
          {creatingProject ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>

    <!-- Existing Projects Section -->
    <div class="section existing-projects-section">
      <div class="section-header">
        <h2>Your Projects</h2>
        <button class="refresh-button" on:click={loadProjects} disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      {#if loading}
        <div class="loading">Loading projects...</div>
      {:else if error}
        <div class="error">
          {error}
          <button on:click={loadProjects}>Try Again</button>
        </div>
      {:else if existingProjects.length === 0}
        <div class="empty-state">
          <p>No existing projects found.</p>
          <p>Create a new project to get started!</p>
        </div>
      {:else}
        <div class="projects-grid">
          {#each existingProjects as project}
            <div class="project-card" on:click={() => selectProject(project)}>
              <div class="project-header">
                <h3>{project.corpus_name}</h3>
                <button
                  class="delete-button"
                  on:click={(e) => deleteProject(project, e)}
                  title="Delete project"
                >
                  ×
                </button>
              </div>

              <div class="project-details">
                <div class="detail-row">
                  <span class="label">Model:</span>
                  <span class="value">{project.model_name}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Files:</span>
                  <span class="value">{project.file_count}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Last Modified:</span>
                  <span class="value">{formatDate(project.last_modified)}</span>
                </div>
              </div>

              <div class="project-progress">
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    style="width: {getStageProgress(project.stages)}%"
                  ></div>
                </div>
                <span class="progress-text">{getStageText(project.stages)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .project-manager {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  .header {
    text-align: center;
    color: white;
    margin-bottom: 3rem;
  }

  .header h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    font-weight: 700;
  }

  .subtitle {
    font-size: 1.1rem;
    opacity: 0.9;
  }

  .content {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
    align-items: start;
  }

  .section {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .section h2 {
    margin-top: 0;
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
    color: #333;
  }

  .new-project-section {
    position: sticky;
    top: 2rem;
  }

  .new-project-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 600;
    color: #555;
    font-size: 0.9rem;
  }

  .form-group input,
  .form-group select {
    padding: 0.75rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 1rem;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #667eea;
  }

  .form-group input:disabled,
  .form-group select:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }

  .create-button {
    padding: 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .create-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .create-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .section-header h2 {
    margin: 0;
  }

  .refresh-button {
    padding: 0.5rem 1rem;
    background: #f0f0f0;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background 0.2s;
  }

  .refresh-button:hover:not(:disabled) {
    background: #e0e0e0;
  }

  .refresh-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading,
  .error,
  .empty-state {
    text-align: center;
    padding: 3rem 2rem;
    color: #666;
  }

  .error {
    color: #e74c3c;
  }

  .error button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .projects-grid {
    display: grid;
    gap: 1.5rem;
  }

  .project-card {
    padding: 1.5rem;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  }

  .project-card:hover {
    border-color: #667eea;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    transform: translateY(-2px);
  }

  .project-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 1rem;
  }

  .project-header h3 {
    margin: 0;
    font-size: 1.3rem;
    color: #333;
    flex: 1;
  }

  .delete-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #999;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .delete-button:hover {
    background: #fee;
    color: #e74c3c;
  }

  .project-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
  }

  .detail-row .label {
    color: #666;
    font-weight: 500;
  }

  .detail-row .value {
    color: #333;
  }

  .project-progress {
    margin-top: 1rem;
  }

  .progress-bar {
    width: 100%;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.85rem;
    color: #666;
  }

  @media (max-width: 968px) {
    .content {
      grid-template-columns: 1fr;
    }

    .new-project-section {
      position: static;
    }
  }
</style>
