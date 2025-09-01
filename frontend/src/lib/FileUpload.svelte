<script>
  import { createEventDispatcher } from 'svelte';
  import { apiService } from './api.js';
  import { uploadedFiles, setError, setLoading, selectedLLM, corpusName } from './stores.js';

  const dispatch = createEventDispatcher();
  
  let fileInput;
  let dragActive = false;
  let files = [];
  let processing = false;
  let llm = 'qwen/qwen3-14b';
  let corpus = '';

  // Subscribe to store values
  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });

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

  function addFiles(newFiles) {
    const pdfFiles = newFiles.filter(file => file.type === 'application/pdf');
    files = [...files, ...pdfFiles];
    uploadedFiles.set(files);
  }

  function removeFile(index) {
    files = files.filter((_, i) => i !== index);
    uploadedFiles.set(files);
  }

  async function uploadAndExtractFiles() {
    if (files.length === 0) {
      setError('Please select at least one PDF file');
      return;
    }

    processing = true;
    setLoading(true);
    
    try {
      // First upload the files
      const uploadResult = await apiService.uploadFiles(files);
      
      // Then extract them to txt files
      const extractResult = await apiService.extractDocuments(llm, corpus);
      
      dispatch('extracted', { upload: uploadResult, extract: extractResult });
      setError(null);
    } catch (err) {
      setError('Failed to upload and extract files: ' + err.message);
    } finally {
      processing = false;
      setLoading(false);
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

<div class="file-upload">
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

  <input
    bind:this={fileInput}
    type="file"
    accept=".pdf"
    multiple
    on:change={handleFileSelect}
    style="display: none;"
  />

  {#if files.length > 0}
    <div class="file-list">
      <h4>Selected Files ({files.length})</h4>
      {#each files as file, index}
        <div class="file-item">
          <div class="file-info">
            <span class="file-name">{file.name}</span>
            <span class="file-size">{formatFileSize(file.size)}</span>
          </div>
          <button class="remove-btn" on:click={() => removeFile(index)}>
            ×
          </button>
        </div>
      {/each}
      
      <button class="upload-btn" on:click={uploadAndExtractFiles} disabled={processing}>
        {#if processing}
          Extracting text from {files.length} file{files.length !== 1 ? 's' : ''}...
        {:else}
          Upload & Extract {files.length} file{files.length !== 1 ? 's' : ''}
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  .file-upload {
    max-width: 600px;
    margin: 0 auto;
  }

  .drop-zone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 40px 20px;
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
    font-size: 18px;
  }

  .drop-zone-content p {
    margin: 0;
    color: #666;
    font-size: 14px;
  }

  .file-list {
    margin-top: 20px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: white;
  }

  .file-list h4 {
    margin: 0 0 16px 0;
    color: #333;
  }

  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
  }

  .file-item:last-child {
    border-bottom: none;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .file-name {
    font-weight: 500;
    color: #333;
    margin-bottom: 4px;
  }

  .file-size {
    font-size: 12px;
    color: #666;
  }

  .remove-btn {
    background: #ff4444;
    color: white;
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-btn:hover {
    background: #cc0000;
  }

  .upload-btn {
    background: #4CAF50;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    margin-top: 16px;
    width: 100%;
  }

  .upload-btn:hover:not(:disabled) {
    background: #45a049;
  }

  .upload-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

</style>