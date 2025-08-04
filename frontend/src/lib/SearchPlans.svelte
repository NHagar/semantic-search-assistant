<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { searchPlans, searchPlansGenerated, userQuery, setError, setLoading } from './stores.js';
  import { onMount } from 'svelte';

  const dispatch = createEventDispatcher();
  
  let plans = [];
  let generating = false;
  let query = '';
  let editingPlan = null;
  let editContent = '';
  
  // Subscribe to store changes
  searchPlans.subscribe(value => {
    plans = value;
  });
  
  userQuery.subscribe(value => {
    query = value;
  });

  onMount(async () => {
    await loadSearchPlans();
  });

  async function loadSearchPlans() {
    try {
      const result = await apiService.getSearchPlans();
      plans = result.plans;
      searchPlans.set(result.plans);
      searchPlansGenerated.set(plans.length > 0);
    } catch (err) {
      setError('Failed to load search plans: ' + err.message);
    }
  }

  async function generateSearchPlans() {
    if (!query.trim()) {
      setError('Please enter a research query');
      return;
    }

    generating = true;
    setLoading(true);
    
    try {
      const result = await apiService.generateSearchPlans(query);
      plans = result.plans.map((plan, index) => ({
        id: `search_plan_${index + 1}`,
        filename: `search_plan_${index + 1}.txt`,
        content: plan
      }));
      
      searchPlans.set(plans);
      searchPlansGenerated.set(true);
      userQuery.set(query);
      dispatch('generated', result);
      setError(null);
    } catch (err) {
      setError('Failed to generate search plans: ' + err.message);
    } finally {
      generating = false;
      setLoading(false);
    }
  }

  function startEditing(plan) {
    editingPlan = plan.id;
    editContent = plan.content;
  }

  async function savePlan(plan) {
    try {
      await apiService.updateSearchPlan(plan.id, editContent);
      
      // Update local state
      plans = plans.map(p => 
        p.id === plan.id ? { ...p, content: editContent } : p
      );
      searchPlans.set(plans);
      
      editingPlan = null;
      editContent = '';
      dispatch('saved', { planId: plan.id, content: editContent });
      setError(null);
    } catch (err) {
      setError('Failed to save search plan: ' + err.message);
    }
  }

  function cancelEdit() {
    editingPlan = null;
    editContent = '';
  }

  async function regeneratePlans() {
    plans = [];
    searchPlans.set([]);
    searchPlansGenerated.set(false);
    await generateSearchPlans();
  }
</script>

<div class="search-plans">
  <div class="header">
    <h3>Search Plans</h3>
    {#if plans.length > 0}
      <button class="regenerate-btn" on:click={regeneratePlans} disabled={generating}>
        {#if generating}
          Regenerating...
        {:else}
          Regenerate All
        {/if}
      </button>
    {/if}
  </div>

  {#if plans.length === 0}
    <div class="query-input">
      <h4>Research Query</h4>
      <textarea
        bind:value={query}
        placeholder="Enter your research question or topic..."
        rows="3"
      ></textarea>
      <button 
        class="generate-btn" 
        on:click={generateSearchPlans}
        disabled={generating || !query.trim()}
      >
        {#if generating}
          Generating Search Plans...
        {:else}
          Generate Search Plans
        {/if}
      </button>
    </div>
  {:else}
    <div class="query-display">
      <h4>Research Query:</h4>
      <p>"{query}"</p>
    </div>

    <div class="plans-list">
      {#each plans as plan, index}
        <div class="plan-item">
          <div class="plan-header">
            <h5>Search Plan {index + 1}</h5>
            <div class="plan-actions">
              {#if editingPlan === plan.id}
                <button class="save-btn" on:click={() => savePlan(plan)}>Save</button>
                <button class="cancel-btn" on:click={cancelEdit}>Cancel</button>
              {:else}
                <button class="edit-btn" on:click={() => startEditing(plan)}>Edit</button>
              {/if}
            </div>
          </div>
          
          <div class="plan-content">
            {#if editingPlan === plan.id}
              <textarea
                bind:value={editContent}
                rows="12"
                class="plan-editor"
              ></textarea>
            {:else}
              <pre class="plan-display">{plan.content}</pre>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="next-step">
      <button class="execute-btn" on:click={() => dispatch('execute')}>
        Execute Search Plans
      </button>
    </div>
  {/if}
</div>

<style>
  .search-plans {
    max-width: 900px;
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

  .regenerate-btn {
    background: #FF9800;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .regenerate-btn:hover:not(:disabled) {
    background: #F57C00;
  }

  .regenerate-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .query-input {
    background: white;
    padding: 24px;
    border-radius: 8px;
    border: 1px solid #ddd;
  }

  .query-input h4 {
    margin: 0 0 12px 0;
    color: #333;
  }

  .query-input textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    resize: vertical;
    margin-bottom: 16px;
  }

  .generate-btn {
    background: #4CAF50;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    width: 100%;
  }

  .generate-btn:hover:not(:disabled) {
    background: #45a049;
  }

  .generate-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .query-display {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid #e9ecef;
    margin-bottom: 20px;
  }

  .query-display h4 {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 14px;
  }

  .query-display p {
    margin: 0;
    font-style: italic;
    color: #666;
  }

  .plans-list {
    display: grid;
    gap: 20px;
  }

  .plan-item {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }

  .plan-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: #f8f9fa;
    border-bottom: 1px solid #e9ecef;
  }

  .plan-header h5 {
    margin: 0;
    color: #333;
  }

  .plan-actions {
    display: flex;
    gap: 8px;
  }

  .plan-actions button {
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

  .plan-content {
    padding: 20px;
  }

  .plan-editor {
    width: 100%;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.4;
    resize: vertical;
  }

  .plan-display {
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-wrap: break-word;
    background: #f8f9fa;
    padding: 16px;
    border-radius: 4px;
    border: 1px solid #e9ecef;
  }

  .next-step {
    margin-top: 30px;
    text-align: center;
  }

  .execute-btn {
    background: #9C27B0;
    color: white;
    border: none;
    padding: 16px 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    font-weight: 500;
  }

  .execute-btn:hover {
    background: #7B1FA2;
  }
</style>