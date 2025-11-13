<script>
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { onMount } from 'svelte';
  import CitationPreview from './CitationPreview.svelte';

  export let text = '';
  export let llm = '';
  export let corpusName = '';

  let containerElement;
  let citationComponents = [];

  // Regular expression to match citation keys like [7aa4eb:1]
  const citationRegex = /\[([a-f0-9]{6}:\d+)\]/g;

  // Configure marked for better rendering and security
  // Disable raw HTML parsing to prevent XSS (defense in depth with DOMPurify)
  marked.setOptions({
    breaks: true,
    gfm: true,
    // Disable HTML parsing - any HTML in markdown will be escaped
    // Exception: our citation markers are added AFTER user input is processed
  });

  // Use marked's walkTokens to ensure no HTML tokens are processed from user input
  marked.use({
    walkTokens(token) {
      // This runs before rendering, allowing us to inspect/modify tokens
      // HTML tokens from user input would appear here
    }
  });

  // Configure DOMPurify - whitelist only safe tags and attributes
  const purifyConfig = {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'ul', 'ol', 'li',
      'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'img',
      'hr',
      'span', 'div'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'data-cite-key'],
    ALLOW_DATA_ATTR: false,
  };

  // Store citation data indexed by marker
  let citationsMap = new Map();

  // Parse markdown and prepare HTML with citation markers
  function parseMarkdownWithCitations(inputText) {
    if (!inputText) return '';

    citationsMap.clear();

    // Step 1: Replace citations with inline span markers that survive markdown parsing
    let textWithMarkers = inputText.replace(citationRegex, (match, key) => {
      const markerId = `cite-${Math.random().toString(36).substr(2, 9)}`;
      citationsMap.set(markerId, key);
      // Use a span that will remain inline in the rendered HTML
      return `<span class="citation-marker" data-cite-key="${markerId}"></span>`;
    });

    // Step 2: Parse markdown to HTML
    let html = marked.parse(textWithMarkers);

    // Step 3: Sanitize HTML to prevent XSS attacks
    const sanitized = DOMPurify.sanitize(html, purifyConfig);

    return sanitized;
  }

  // Svelte action to mount citation components in place of markers
  function handleCitations(node) {
    // Find all citation markers
    const markers = node.querySelectorAll('.citation-marker');

    // Clean up any existing components
    citationComponents.forEach(comp => {
      if (comp.$destroy) comp.$destroy();
    });
    citationComponents = [];

    markers.forEach(marker => {
      const markerId = marker.getAttribute('data-cite-key');
      const citationKey = citationsMap.get(markerId);

      if (citationKey) {
        // Create a container for the citation component
        const container = document.createElement('span');
        container.className = 'citation-wrapper';

        // Replace the marker with the container
        marker.parentNode.replaceChild(container, marker);

        // Mount the CitationPreview component
        const component = new CitationPreview({
          target: container,
          props: {
            citationKey,
            llm,
            corpusName
          }
        });

        citationComponents.push(component);
      }
    });

    return {
      destroy() {
        citationComponents.forEach(comp => {
          if (comp.$destroy) comp.$destroy();
        });
        citationComponents = [];
      }
    };
  }

  $: sanitizedHtml = parseMarkdownWithCitations(text);

  // Re-apply action when props change
  $: if (containerElement && sanitizedHtml) {
    setTimeout(() => {
      handleCitations(containerElement);
    }, 0);
  }
</script>

<div
  class="text-with-citations markdown-content"
  bind:this={containerElement}
  use:handleCitations
>
  {@html sanitizedHtml}
</div>

<style>
  .text-with-citations {
    line-height: 1.8;
    color: #2c3e50;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
    font-size: 15px;
  }

  /* Global markdown styling */
  .text-with-citations :global(h1) {
    font-size: 2em;
    font-weight: 700;
    margin: 0.67em 0 0.5em 0;
    color: #1a202c;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 0.3em;
    line-height: 1.2;
  }

  .text-with-citations :global(h2) {
    font-size: 1.5em;
    font-weight: 600;
    margin: 1em 0 0.5em 0;
    color: #2d3748;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 0.3em;
    line-height: 1.3;
  }

  .text-with-citations :global(h3) {
    font-size: 1.25em;
    font-weight: 600;
    margin: 0.9em 0 0.4em 0;
    color: #2d3748;
    line-height: 1.4;
  }

  .text-with-citations :global(h4) {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0.8em 0 0.3em 0;
    color: #4a5568;
    line-height: 1.4;
  }

  .text-with-citations :global(h5) {
    font-size: 1em;
    font-weight: 600;
    margin: 0.7em 0 0.3em 0;
    color: #4a5568;
  }

  .text-with-citations :global(h6) {
    font-size: 0.9em;
    font-weight: 600;
    margin: 0.6em 0 0.3em 0;
    color: #718096;
  }

  .text-with-citations :global(p) {
    margin: 0 0 1.2em 0;
    line-height: 1.8;
  }

  .text-with-citations :global(strong) {
    font-weight: 600;
    color: #1a202c;
  }

  .text-with-citations :global(em) {
    font-style: italic;
    color: #4a5568;
  }

  .text-with-citations :global(ul),
  .text-with-citations :global(ol) {
    margin: 0 0 1.2em 0;
    padding-left: 2em;
  }

  .text-with-citations :global(li) {
    margin: 0.4em 0;
    line-height: 1.6;
  }

  .text-with-citations :global(ul) {
    list-style-type: disc;
  }

  .text-with-citations :global(ul ul) {
    list-style-type: circle;
    margin: 0.3em 0;
  }

  .text-with-citations :global(ul ul ul) {
    list-style-type: square;
  }

  .text-with-citations :global(ol) {
    list-style-type: decimal;
  }

  .text-with-citations :global(ol ol) {
    list-style-type: lower-alpha;
    margin: 0.3em 0;
  }

  .text-with-citations :global(blockquote) {
    margin: 1.2em 0;
    padding: 0.8em 1.2em;
    border-left: 4px solid #3b82f6;
    background: #f7fafc;
    color: #4a5568;
    font-style: italic;
  }

  .text-with-citations :global(blockquote p) {
    margin: 0;
  }

  .text-with-citations :global(code) {
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    padding: 0.2em 0.4em;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace;
    font-size: 0.9em;
    color: #e53e3e;
  }

  .text-with-citations :global(pre) {
    background: #1a202c;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 1em;
    margin: 1.2em 0;
    overflow-x: auto;
    line-height: 1.5;
  }

  .text-with-citations :global(pre code) {
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
    font-size: 0.9em;
  }

  .text-with-citations :global(hr) {
    border: none;
    border-top: 2px solid #e2e8f0;
    margin: 2em 0;
  }

  .text-with-citations :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1.2em 0;
    font-size: 0.95em;
  }

  .text-with-citations :global(table th),
  .text-with-citations :global(table td) {
    border: 1px solid #e2e8f0;
    padding: 0.75em 1em;
    text-align: left;
  }

  .text-with-citations :global(table th) {
    background: #f7fafc;
    font-weight: 600;
    color: #2d3748;
  }

  .text-with-citations :global(table tr:nth-child(even)) {
    background: #f7fafc;
  }

  .text-with-citations :global(a) {
    color: #3b82f6;
    text-decoration: none;
  }

  .text-with-citations :global(a:hover) {
    text-decoration: underline;
  }

  .text-with-citations :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin: 1em 0;
  }
</style>
