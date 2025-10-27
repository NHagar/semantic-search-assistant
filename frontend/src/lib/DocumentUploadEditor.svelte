<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { apiService } from './api.js';
  import { setError, setLoading, selectedLLM, corpusName } from './stores.js';
  import * as pdfjsLib from 'pdfjs-dist';

  const dispatch = createEventDispatcher();

  let fileInput;
  let dragActive = false;
  let documents = []; // Array of {file, name, text, extracting, error, isExisting, isModified, isUploadedFromServer}
  let selectedDocIndex = 0;
  let editedText = '';
  let llm = 'qwen/qwen3-14b';
  let corpus = '';
  let extractingCount = 0;
  let embedding = false;
  let loading = false;
  let originalTexts = {}; // Track original text for each document

  // Subscribe to store values
  selectedLLM.subscribe(value => { llm = value || 'qwen/qwen3-14b'; });
  corpusName.subscribe(value => { corpus = value || ''; });

  // Configure PDF.js worker and load existing documents
  onMount(async () => {
    // Use the worker from node_modules instead of CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href;

    // Load existing documents from vector database
    await loadProjectDocuments();
  });

  async function loadProjectDocuments() {
    if (!corpus || !llm) {
      return;
    }

    loading = true;
    try {
      const [uploadedResponse, embeddedResponse] = await Promise.all([
        apiService.getUploadedDocuments(llm, corpus),
        apiService.getEmbeddedDocuments(llm, corpus)
      ]);

      const embeddedDocs = (embeddedResponse.documents || []).map(doc => ({
        file: null,
        name: doc.filename,
        text: doc.text,
        extracting: false,
        error: null,
        isExisting: true,
        isModified: false,
        isUploadedFromServer: false
      }));

      // Store original texts for existing documents
      originalTexts = {};
      embeddedDocs.forEach(doc => {
        originalTexts[doc.name] = doc.text;
      });

      const embeddedNames = new Set(embeddedDocs.map(doc => doc.name));

      const uploadedDocs = (uploadedResponse.documents || [])
        .filter(doc => !embeddedNames.has(doc.filename))
        .map(doc => ({
          file: null,
          name: doc.filename,
          text: '',
          extracting: false,
          error: null,
          isExisting: false,
          isModified: false,
          isUploadedFromServer: true,
          size: doc.size,
          uploadedAt: doc.uploaded_at
        }));

      documents = [...embeddedDocs, ...uploadedDocs];

      if (documents.length > 0) {
        selectedDocIndex = 0;
        editedText = documents[0].text || '';
      } else {
        selectedDocIndex = 0;
        editedText = '';
      }
    } catch (err) {
      console.error('Failed to load existing documents:', err);
      // Don't set error - just start with empty state
    } finally {
      loading = false;
    }
  }

  $: {
    // Update edited text when selection changes
    if (documents[selectedDocIndex]) {
      editedText = documents[selectedDocIndex].text || '';
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

  // Helper function to normalize filename (matches backend's secure_filename behavior)
  function normalizeFilename(filename) {
    // Remove extension, normalize, then add back
    const nameWithoutExt = filename.replace(/\.pdf$/i, '');
    const normalized = nameWithoutExt
      .replace(/[^\w\s-]/g, '') // Remove special chars except word chars, spaces, hyphens
      .replace(/[-\s]+/g, '_')   // Replace spaces and hyphens with underscores
      .replace(/^_+|_+$/g, '');  // Trim underscores from start/end
    return normalized + '.pdf';
  }

  async function addFiles(newFiles) {
    const pdfFiles = newFiles.filter(file => file.type === 'application/pdf');

    for (const file of pdfFiles) {
      // Normalize filename to match what backend will save
      const normalizedName = normalizeFilename(file.name);

      // Check if file already exists
      if (documents.some(doc => doc.name === normalizedName)) {
        continue;
      }

      const doc = {
        file: file,
        name: normalizedName,
        text: '',
        extracting: true,
        error: null,
        isExisting: false,
        isModified: false,
        isUploadedFromServer: false
      };

      documents = [...documents, doc];
      const docIndex = documents.length - 1;
      extractingCount++;

      // Extract text from PDF
      try {
        const text = await extractTextFromPDF(file);
        documents[docIndex].text = text;
        documents[docIndex].extracting = false;
        documents = documents; // Trigger reactivity

        // Select the newly added document if it's the first one
        if (documents.length === 1) {
          selectedDocIndex = 0;
          editedText = text;
        }
      } catch (err) {
        documents[docIndex].error = err.message;
        documents[docIndex].extracting = false;
        documents = documents; // Trigger reactivity
      } finally {
        extractingCount--;
      }
    }
  }

  async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }

    return fullText.trim();
  }

  async function removeDocument(index) {
    const doc = documents[index];

    // If it's an existing document in the vector database, delete it
    if (doc.isExisting) {
      try {
        await apiService.deleteEmbeddedDocument(doc.name, llm, corpus);
        // Also remove from originalTexts
        delete originalTexts[doc.name];
      } catch (err) {
        setError(`Failed to delete document: ${err.message}`);
        return;
      }
    } else if (doc.isUploadedFromServer) {
      try {
        await apiService.deleteUploadedDocument(doc.name, llm, corpus);
      } catch (err) {
        setError(`Failed to delete uploaded document: ${err.message}`);
        return;
      }
    }

    // Remove from local state
    documents = documents.filter((_, i) => i !== index);

    // Adjust selected index if needed
    if (selectedDocIndex >= documents.length) {
      selectedDocIndex = Math.max(0, documents.length - 1);
    }

    if (documents.length > 0) {
      editedText = documents[selectedDocIndex].text || '';
    } else {
      editedText = '';
    }
  }

  function selectDocument(index) {
    // Save current edits before switching
    if (selectedDocIndex !== null && documents[selectedDocIndex]) {
      documents[selectedDocIndex].text = editedText;
    }

    selectedDocIndex = index;
    editedText = documents[index].text || '';
  }

  function handleTextEdit(event) {
    editedText = event.target.value;
    if (documents[selectedDocIndex]) {
      documents[selectedDocIndex].text = editedText;

      // Mark as modified if it's an existing document and text has changed
      if (documents[selectedDocIndex].isExisting) {
        const originalText = originalTexts[documents[selectedDocIndex].name];
        documents[selectedDocIndex].isModified = (editedText !== originalText);
      }
    }
  }

  function openFilePicker() {
    fileInput.click();
  }

  async function embedAndProceed() {
    if (documents.length === 0) {
      setError('Please upload at least one PDF document');
      return;
    }

    if (!corpus) {
      setError('No project selected. Please go back and select or create a project.');
      return;
    }

    // Save current edits
    if (selectedDocIndex !== null && documents[selectedDocIndex]) {
      documents[selectedDocIndex].text = editedText;
    }

    embedding = true;
    setLoading(true);

    try {
      // Separate documents into new vs modified/existing
      const newDocuments = documents.filter(doc => !doc.isExisting);
      const modifiedDocuments = documents.filter(doc => doc.isExisting && doc.isModified);
      const unchangedDocuments = documents.filter(doc => doc.isExisting && !doc.isModified);
      const serverUploadedDocuments = newDocuments.filter(doc => doc.isUploadedFromServer);

      console.log(
        `New: ${newDocuments.length}, Modified: ${modifiedDocuments.length}, ` +
        `Unchanged: ${unchangedDocuments.length}, Server uploads: ${serverUploadedDocuments.length}`
      );

      // Upload PDF files for new documents that originated from the browser
      const browserUploadedDocuments = newDocuments.filter(doc => !doc.isUploadedFromServer);
      if (browserUploadedDocuments.length > 0) {
        const filesToUpload = browserUploadedDocuments.map(doc => doc.file).filter(f => f !== null);
        if (filesToUpload.length > 0) {
          await apiService.uploadFiles(filesToUpload, llm, corpus);
        }
      }

      // For modified documents, delete old embeddings
      for (const doc of modifiedDocuments) {
        await apiService.deleteEmbeddedDocument(doc.name, llm, corpus);
      }

      // Save text for new and modified documents that have editable content
      const documentsToSave = [...browserUploadedDocuments, ...modifiedDocuments];
      let shouldRebuild = false;
      if (documentsToSave.length > 0) {
        const documentTexts = {};
        documentsToSave.forEach(doc => {
          documentTexts[doc.name] = doc.text;
        });

        // Save the edited texts to the backend
        await apiService.saveExtractedTexts(documentTexts, llm, corpus);
        shouldRebuild = true;
      }

      if (serverUploadedDocuments.length > 0) {
        shouldRebuild = true;
      }

      if (shouldRebuild) {
        // Build or rebuild the vector database to include newly uploaded files
        await apiService.extractDocuments(llm, corpus);
      }

      // Update all documents to be marked as existing and unmodified locally
      documents = documents.map(doc => ({
        ...doc,
        isExisting: true,
        isModified: false,
        isUploadedFromServer: false
      }));

      // Update original texts with the latest edits we have locally
      documents.forEach(doc => {
        originalTexts[doc.name] = doc.text;
      });

      // Refresh the document list from the backend so the UI reflects uploaded-only files as embedded
      await loadProjectDocuments();

      dispatch('extracted', { documents: documents });
      setError(null);
    } catch (err) {
      setError('Failed to embed documents: ' + err.message);
    } finally {
      embedding = false;
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

  function formatUploadDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString();
  }
</script>

<div class="document-upload-editor">
  {#if documents.length === 0}
    <!-- Initial upload zone -->
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
        {#if extractingCount > 0}
          <div class="extraction-progress">
            <div class="spinner"></div>
            <span>Extracting text from {extractingCount} document{extractingCount !== 1 ? 's' : ''}...</span>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Editor view with sidebar -->
    <div class="editor-container">
      <!-- Sidebar with document list -->
      <div class="sidebar">
        <div class="sidebar-header">
          <h3>Documents ({documents.length})</h3>
        </div>
        <div class="document-list">
          {#each documents as doc, index}
            <div
              class="document-item"
              class:selected={index === selectedDocIndex}
              class:extracting={doc.extracting}
              class:error={doc.error}
              on:click={() => !doc.extracting && selectDocument(index)}
            >
              <div class="document-info">
                <div class="document-name" title={doc.name}>{doc.name}</div>
                {#if doc.extracting}
                  <div class="status extracting">
                    <div class="mini-spinner"></div>
                    <span>Extracting...</span>
                  </div>
                {:else if doc.error}
                  <div class="status error">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span>Error</span>
                  </div>
                {:else if doc.isModified}
                  <div class="status modified">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>Modified</span>
                  </div>
                {:else if doc.isUploadedFromServer}
                  <div class="status uploaded">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="4,14 10,20 20,6" />
                    </svg>
                    <span>Uploaded</span>
                  </div>
                {:else if doc.isExisting}
                  <div class="status embedded">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                    <span>Embedded</span>
                  </div>
                {:else}
                  <div class="status success">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                    <span>Ready</span>
                  </div>
                {/if}
              </div>
              {#if !doc.extracting}
                <button class="remove-btn" on:click|stopPropagation={() => removeDocument(index)} title="Remove document">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3,6 5,6 21,6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Main editor area -->
      <div class="editor-area">
        {#if documents[selectedDocIndex]}
          <div class="editor-header">
            <h3>{documents[selectedDocIndex].name}</h3>
            {#if documents[selectedDocIndex].file}
              <span class="file-size">{formatFileSize(documents[selectedDocIndex].file.size)}</span>
            {:else if documents[selectedDocIndex].size}
              <span class="file-size">{formatFileSize(documents[selectedDocIndex].size)}</span>
            {/if}
          </div>

          {#if documents[selectedDocIndex].extracting}
            <div class="extraction-message">
              <div class="spinner"></div>
              <p>Extracting text from PDF...</p>
            </div>
          {:else if documents[selectedDocIndex].error}
            <div class="error-message">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p>Failed to extract text: {documents[selectedDocIndex].error}</p>
            </div>
          {:else if documents[selectedDocIndex].isUploadedFromServer}
            <div class="info-message">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <div>
                <p>This document was previously uploaded and is waiting to be embedded.</p>
                <p class="info-subtext">Run "Embed & Continue" to process it, or re-upload the PDF to edit the extracted text before embedding.</p>
                {#if documents[selectedDocIndex].uploadedAt}
                  <p class="info-meta">Uploaded on {formatUploadDate(documents[selectedDocIndex].uploadedAt)}</p>
                {/if}
              </div>
            </div>
          {:else}
            <textarea
              class="text-editor"
              bind:value={editedText}
              on:input={handleTextEdit}
              placeholder="Extracted text will appear here..."
            ></textarea>
            <div class="editor-footer">
              <span class="char-count">{editedText.length.toLocaleString()} characters</span>
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Action buttons -->
    <div class="action-buttons">
      <button class="add-more-btn" on:click={openFilePicker} disabled={embedding || extractingCount > 0}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add More Documents
      </button>

      <button class="embed-btn" on:click={embedAndProceed} disabled={embedding || extractingCount > 0 || documents.length === 0}>
        {#if embedding}
          <div class="mini-spinner"></div>
          Embedding Documents...
        {:else}
          Embed & Continue
        {/if}
      </button>
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
    border-radius: 8px;
    padding: 60px 20px;
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

  .extraction-progress {
    margin-top: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #2196F3;
    font-size: 14px;
  }

  .editor-container {
    display: flex;
    gap: 0;
    min-height: 500px;
    max-width: 100%;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    background: white;
  }

  .sidebar {
    width: 280px;
    min-width: 280px;
    max-width: 280px;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    background: #f8f9fa;
    flex-shrink: 0;
  }

  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
    background: white;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
  }

  .document-list {
    flex: 1;
    overflow-y: auto;
  }

  .document-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    cursor: pointer;
    transition: background 0.2s;
    border-bottom: 1px solid #e9ecef;
  }

  .document-item:hover {
    background: #e9ecef;
  }

  .document-item.selected {
    background: #e3f2fd;
    border-left: 3px solid #2196F3;
  }

  .document-item.extracting {
    opacity: 0.7;
    cursor: default;
  }

  .document-item.error {
    background: #ffebee;
  }

  .document-info {
    flex: 1;
    min-width: 0;
  }

  .document-name {
    font-size: 14px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status.extracting {
    color: #2196F3;
  }

  .status.success {
    color: #4CAF50;
  }

  .status.uploaded {
    color: #3F51B5;
  }

  .status.embedded {
    color: #009688;
  }

  .status.modified {
    color: #FF9800;
  }

  .status.error {
    color: #f44336;
  }

  .remove-btn {
    background: transparent;
    color: #999;
    border: none;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: 8px;
    transition: all 0.2s;
    padding: 4px;
  }

  .remove-btn:hover {
    background: #ffebee;
    color: #d32f2f;
  }

  .remove-btn svg {
    transition: transform 0.2s;
  }

  .remove-btn:hover svg {
    transform: scale(1.1);
  }

  .editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: white;
    min-width: 0;
    overflow: hidden;
  }

  .editor-header {
    padding: 16px 20px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fafafa;
    gap: 12px;
    min-width: 0;
  }

  .editor-header h3 {
    margin: 0;
    font-size: 16px;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
  }

  .file-size {
    font-size: 12px;
    color: #666;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .text-editor {
    flex: 1;
    padding: 20px;
    border: none;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    resize: none;
    outline: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .editor-footer {
    padding: 8px 20px;
    border-top: 1px solid #e0e0e0;
    background: #fafafa;
    text-align: right;
  }

  .char-count {
    font-size: 12px;
    color: #666;
  }

  .extraction-message,
  .error-message {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 40px;
  }

  .extraction-message {
    color: #2196F3;
  }

  .error-message {
    color: #f44336;
  }

  .info-message {
    flex: 1;
    display: flex;
    gap: 16px;
    align-items: flex-start;
    background: #f5f7ff;
    border-radius: 8px;
    padding: 32px;
    color: #3F51B5;
  }

  .info-message svg {
    flex-shrink: 0;
  }

  .info-message p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
  }

  .info-subtext {
    margin-top: 4px;
    color: #3949AB;
  }

  .info-meta {
    margin-top: 8px;
    font-size: 12px;
    color: #5C6BC0;
  }

  .extraction-message p,
  .error-message p {
    margin: 0;
    font-size: 14px;
  }

  .action-buttons {
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .add-more-btn {
    background: white;
    color: #2196F3;
    border: 2px solid #2196F3;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
  }

  .add-more-btn:hover:not(:disabled) {
    background: #e3f2fd;
  }

  .add-more-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .embed-btn {
    background: #4CAF50;
    color: white;
    border: none;
    padding: 12px 32px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s;
  }

  .embed-btn:hover:not(:disabled) {
    background: #45a049;
  }

  .embed-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid #e0e0e0;
    border-top: 3px solid #2196F3;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .mini-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #e0e0e0;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @media (max-width: 768px) {
    .editor-container {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid #e0e0e0;
      max-height: 200px;
    }

    .action-buttons {
      flex-direction: column;
    }
  }
</style>
