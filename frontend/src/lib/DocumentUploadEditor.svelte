<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { apiService } from './api.js';
  import { setError, setLoading, selectedLLM, corpusName } from './stores.js';

  const dispatch = createEventDispatcher();

  let fileInput;
  let dragActive = false;
  let documents = []; // Array of {name, size, isExisting}
  let llm = 'qwen/qwen3-14b';
  let corpus = '';
  let processing = false;
  let progress = 0;
  let progressText = '';

  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });

  onMount(async () => {
    await loadExistingDocuments();
  });

  async function loadExistingDocuments() {
    if (!corpus || !llm) return;

    try {
      const response = await apiService.getEmbeddedDocuments(llm, corpus);
      documents = (response.documents || []).map(doc => ({
        name: doc.filename,
        size: doc.text?.length || 0,
        isExisting: true
      }));
    } catch (err) {
      console.error('Failed to load existing documents:', err);
    }
  }

  function handleFileSelect(event) {
    const selectedFiles = Array.from(event.target.files);
    addFiles(selectedFiles);
  }

  function handleDrop(event) {
    event.preventDefault();
    dragActive = false;
    const droppedFiles = Array.from(event.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(file => file.type === 'application/pdf');
    addFiles(pdfFiles);
  }

  function handleDragOver(event) {
    event.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(event) {
    event.preventDefault();
    dragActive = false;
  }

  function normalizeFilename(filename) {
    if (!filename) return '';
    const parts = filename.split('.');
    let extension = '';
    let baseName = filename;

    if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === 'pdf') {
      extension = parts.pop().toLowerCase();
      baseName = parts.join('.');
    }

    let sanitized = baseName.replace(/[^\p{L}\p{N}_]/gu, '_');
    sanitized = sanitized.replace(/_+/g, '_');
    sanitized = sanitized.replace(/^_+|_+$/g, '');

    if (extension) {
      return `${sanitized}.${extension}`;
    }
    return sanitized;
  }

  function addFiles(newFiles) {
    const pdfFiles = newFiles.filter(file => file.type === 'application/pdf');

    for (const file of pdfFiles) {
      const normalizedName = normalizeFilename(file.name);

      if (documents.some(doc => doc.name === normalizedName || doc.name === normalizedName.replace('.pdf', '.txt'))) {
        continue;
      }

      documents = [...documents, {
        name: normalizedName,
        size: file.size,
        file: file,
        isExisting: false
      }];
    }
  }

  async function removeDocument(index) {
    const doc = documents[index];

    if (doc.isExisting) {
      try {
        await apiService.deleteEmbeddedDocument(doc.name, llm, corpus);
      } catch (err) {
        setError(`Failed to delete document: ${err.message}`);
        return;
      }
    }

    documents = documents.filter((_, i) => i !== index);
  }

  function openFilePicker() {
    fileInput.click();
  }

  async function confirmAndProcess() {
    if (documents.length === 0) {
      setError('Please upload at least one PDF document');
      return;
    }

    if (!corpus) {
      setError('No project selected');
      return;
    }

    // Get new documents to upload
    const newDocs = documents.filter(doc => !doc.isExisting && doc.file);

    // If there are no new documents, just continue to next step
    if (newDocs.length === 0) {
      dispatch('extracted', { documents });
      return;
    }

    processing = true;
    setLoading(true);
    progress = 5;
    progressText = 'Uploading documents...';

    try {
      progress = 20;
      progressText = `Uploading ${newDocs.length} document${newDocs.length !== 1 ? 's' : ''}...`;

      const files = newDocs.map(doc => doc.file);
      await apiService.uploadFiles(files, llm, corpus);

      progress = 50;
      progressText = 'Extracting text from PDFs...';

      // Extract and embed all documents
      await apiService.extractDocuments(llm, corpus);

      progress = 100;
      progressText = 'Processing complete!';

      // Update all documents as existing
      documents = documents.map(doc => ({
        ...doc,
        isExisting: true,
        file: undefined
      }));

      dispatch('extracted', { documents });
      setError(null);
    } catch (err) {
      setError('Failed to process documents: ' + err.message);
      progressText = 'Processing failed';
    } finally {
      processing = false;
      setLoading(false);
      setTimeout(() => {
        progress = 0;
        progressText = '';
      }, 2000);
    }
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
</script>

<div class="document-upload-editor">
  {#if documents.length === 0}
    <div
      class="drop-zone"
      class:drag-active={dragActive}
      on:drop={handleDrop}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:click={() => fileInput.click()}
    >
      <div class="drop-zone-content">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <h3>Drop PDF files here or click to browse</h3>
        <p>Upload multiple PDF documents for semantic search</p>
      </div>
    </div>
  {:else}
    <div class="documents-container">
      <div class="documents-header">
        <h3>Documents ({documents.length})</h3>
      </div>

      <div class="documents-list">
        {#each documents as doc, index}
          <div class="document-card" class:existing={doc.isExisting}>
            <div class="document-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <div class="document-info">
              <div class="document-name">{doc.name}</div>
              <div class="document-meta">
                {formatFileSize(doc.size)}
                {#if doc.isExisting}
                  <span class="badge embedded">Embedded</span>
                {:else}
                  <span class="badge new">New</span>
                {/if}
              </div>
            </div>
            <button
              class="remove-btn"
              on:click={() => removeDocument(index)}
              disabled={processing}
              title="Remove document"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        {/each}
      </div>

      <div class="actions">
        <button
          class="btn-secondary"
          on:click={openFilePicker}
          disabled={processing}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add More Documents
        </button>

        <button
          class="btn-primary"
          on:click={confirmAndProcess}
          disabled={processing || documents.length === 0}
        >
          {#if processing}
            <div class="spinner"></div>
            Processing...
          {:else if documents.length > 0 && documents.filter(d => !d.isExisting).length === 0}
            Continue
          {:else}
            Confirm & Process
          {/if}
        </button>
      </div>

      {#if processing || progress > 0}
        <div class="progress-container">
          <div class="progress-header">
            <span class="progress-text">{progressText}</span>
            <span class="progress-value">{Math.round(progress)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style={`width: ${Math.max(0, Math.min(100, progress))}%`}></div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept=".pdf"
    multiple
    on:change={handleFileSelect}
    style="display: none;"
  />
</div>

<style>
  .document-upload-editor {
    max-width: 100%;
    margin: 0 auto;
  }

  .drop-zone {
    border: 2px dashed #ccc;
    border-radius: 12px;
    padding: 80px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    background-color: #fafafa;
  }

  .drop-zone:hover, .drop-zone.drag-active {
    border-color: #4CAF50;
    background-color: #f0f8f0;
  }

  .drop-zone-content svg {
    color: #666;
    margin-bottom: 16px;
  }

  .drop-zone-content h3 {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 20px;
  }

  .drop-zone-content p {
    margin: 0;
    color: #666;
    font-size: 14px;
  }

  .documents-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .documents-header {
    padding-bottom: 12px;
    border-bottom: 2px solid #e0e0e0;
  }

  .documents-header h3 {
    margin: 0;
    font-size: 18px;
    color: #333;
  }

  .documents-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 400px;
    overflow-y: auto;
    padding: 4px;
  }

  .document-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .document-card:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-color: #ccc;
  }

  .document-card.existing {
    background: #f8fffe;
    border-color: #d0f0ed;
  }

  .document-icon {
    color: #2196F3;
    flex-shrink: 0;
  }

  .document-card.existing .document-icon {
    color: #009688;
  }

  .document-info {
    flex: 1;
    min-width: 0;
  }

  .document-name {
    font-size: 14px;
    font-weight: 500;
    color: #333;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .document-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #666;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge.embedded {
    background: #e0f2f1;
    color: #00695c;
  }

  .badge.new {
    background: #e3f2fd;
    color: #1565c0;
  }

  .remove-btn {
    background: transparent;
    color: #999;
    border: none;
    border-radius: 4px;
    width: 32px;
    height: 32px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.2s;
    padding: 6px;
  }

  .remove-btn:hover:not(:disabled) {
    background: #ffebee;
    color: #d32f2f;
  }

  .remove-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding-top: 8px;
  }

  .btn-secondary,
  .btn-primary {
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
    border: none;
  }

  .btn-secondary {
    background: white;
    color: #2196F3;
    border: 2px solid #2196F3;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e3f2fd;
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #4CAF50;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #45a049;
  }

  .btn-primary:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .progress-container {
    padding: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    font-size: 14px;
    color: #334155;
    font-weight: 500;
  }

  .progress-value {
    font-variant-numeric: tabular-nums;
    color: #1d4ed8;
  }

  .progress-bar {
    height: 10px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%);
    transition: width 0.3s ease;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .actions {
      flex-direction: column;
    }

    .documents-list {
      max-height: 300px;
    }
  }
</style>
