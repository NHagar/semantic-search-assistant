<script>
  import { marked } from 'marked';
  import { onMount, tick } from 'svelte';
  import CitationPreview from './CitationPreview.svelte';

  export let text = '';
  export let llm = '';
  export let corpusName = '';

  let container;
  let citationComponents = [];

  // Configure marked for better rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false
  });

  // Regular expression to match citation keys like [7aa4eb:1]
  const citationRegex = /\[([a-f0-9]{6}:\d+)\]/g;

  // Process text: convert markdown to HTML and track citations
  function processMarkdown(inputText) {
    if (!inputText) return { html: '', citations: [] };

    const citations = [];
    let processedText = inputText;

    // Replace citations with placeholder spans that we'll populate later
    processedText = processedText.replace(citationRegex, (match, citationKey) => {
      const index = citations.length;
      citations.push(citationKey);
      return `<span class="citation-placeholder" data-citation-index="${index}" data-citation-key="${citationKey}"></span>`;
    });

    // Convert markdown to HTML
    const html = marked.parse(processedText);

    return { html, citations };
  }

  // Mount citation components after HTML is rendered
  async function mountCitations() {
    await tick();

    if (!container) return;

    // Clear previous components
    citationComponents.forEach(comp => comp.$destroy && comp.$destroy());
    citationComponents = [];

    // Find all citation placeholders
    const placeholders = container.querySelectorAll('.citation-placeholder');

    placeholders.forEach(placeholder => {
      const citationKey = placeholder.getAttribute('data-citation-key');

      // Create a wrapper span for the citation component
      const wrapper = document.createElement('span');
      wrapper.className = 'citation-wrapper';
      placeholder.parentNode.replaceChild(wrapper, placeholder);

      // Mount CitationPreview component
      const component = new CitationPreview({
        target: wrapper,
        props: {
          citationKey,
          llm,
          corpusName
        }
      });

      citationComponents.push(component);
    });
  }

  $: processed = processMarkdown(text);
  $: if (processed.html && container) {
    mountCitations();
  }

  onMount(() => {
    mountCitations();
  });
</script>

<div class="markdown-renderer" bind:this={container}>
  {@html processed.html}
</div>

<style>
  .markdown-renderer {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
  }

  .markdown-renderer :global(h1) {
    font-size: 24px;
    font-weight: 600;
    margin: 24px 0 16px 0;
    color: #1a1a1a;
    border-bottom: 2px solid #e9ecef;
    padding-bottom: 8px;
  }

  .markdown-renderer :global(h2) {
    font-size: 20px;
    font-weight: 600;
    margin: 20px 0 12px 0;
    color: #1a1a1a;
    border-bottom: 1px solid #e9ecef;
    padding-bottom: 6px;
  }

  .markdown-renderer :global(h3) {
    font-size: 18px;
    font-weight: 600;
    margin: 16px 0 10px 0;
    color: #1a1a1a;
  }

  .markdown-renderer :global(h4) {
    font-size: 16px;
    font-weight: 600;
    margin: 14px 0 8px 0;
    color: #333;
  }

  .markdown-renderer :global(h5) {
    font-size: 14px;
    font-weight: 600;
    margin: 12px 0 6px 0;
    color: #333;
  }

  .markdown-renderer :global(h6) {
    font-size: 13px;
    font-weight: 600;
    margin: 10px 0 6px 0;
    color: #666;
  }

  .markdown-renderer :global(p) {
    margin: 0 0 12px 0;
    line-height: 1.6;
  }

  .markdown-renderer :global(ul),
  .markdown-renderer :global(ol) {
    margin: 0 0 12px 0;
    padding-left: 24px;
  }

  .markdown-renderer :global(li) {
    margin: 4px 0;
    line-height: 1.6;
  }

  .markdown-renderer :global(ul ul),
  .markdown-renderer :global(ol ol),
  .markdown-renderer :global(ul ol),
  .markdown-renderer :global(ol ul) {
    margin: 4px 0;
  }

  .markdown-renderer :global(blockquote) {
    margin: 12px 0;
    padding: 8px 16px;
    border-left: 4px solid #1976d2;
    background: #f5f9fc;
    color: #555;
  }

  .markdown-renderer :global(blockquote p) {
    margin: 0;
  }

  .markdown-renderer :global(code) {
    background: #f4f4f4;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', Consolas, Monaco, monospace;
    font-size: 13px;
    color: #c7254e;
  }

  .markdown-renderer :global(pre) {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    margin: 12px 0;
  }

  .markdown-renderer :global(pre code) {
    background: none;
    padding: 0;
    color: #333;
    font-size: 13px;
    line-height: 1.4;
  }

  .markdown-renderer :global(a) {
    color: #1976d2;
    text-decoration: none;
  }

  .markdown-renderer :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-renderer :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    border: 1px solid #e9ecef;
  }

  .markdown-renderer :global(th),
  .markdown-renderer :global(td) {
    padding: 8px 12px;
    border: 1px solid #e9ecef;
    text-align: left;
  }

  .markdown-renderer :global(th) {
    background: #f8f9fa;
    font-weight: 600;
    color: #333;
  }

  .markdown-renderer :global(tr:nth-child(even)) {
    background: #fafafa;
  }

  .markdown-renderer :global(hr) {
    border: none;
    border-top: 2px solid #e9ecef;
    margin: 24px 0;
  }

  .markdown-renderer :global(strong) {
    font-weight: 600;
  }

  .markdown-renderer :global(em) {
    font-style: italic;
  }

  .markdown-renderer :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin: 12px 0;
  }

  .markdown-renderer :global(.citation-wrapper) {
    display: inline;
  }
</style>
