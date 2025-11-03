<script>
  import CitationPreview from './CitationPreview.svelte';

  export let text = '';
  export let llm = '';
  export let corpusName = '';

  // Regular expression to match citation keys like [7aa4eb:1]
  const citationRegex = /\[([a-f0-9]{6}:\d+)\]/g;

  // Parse text and split into segments with citation markers
  function parseTextWithCitations(inputText) {
    if (!inputText) return [];

    const segments = [];
    let lastIndex = 0;
    let match;

    // Reset regex lastIndex
    citationRegex.lastIndex = 0;

    while ((match = citationRegex.exec(inputText)) !== null) {
      // Add text before the citation
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: inputText.substring(lastIndex, match.index)
        });
      }

      // Add the citation
      segments.push({
        type: 'citation',
        content: match[1] // The citation key without brackets
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last citation
    if (lastIndex < inputText.length) {
      segments.push({
        type: 'text',
        content: inputText.substring(lastIndex)
      });
    }

    // If no citations found, return the whole text
    if (segments.length === 0) {
      segments.push({
        type: 'text',
        content: inputText
      });
    }

    return segments;
  }

  $: segments = parseTextWithCitations(text);
</script>

<div class="text-with-citations">
  {#each segments as segment, index (segment.type === 'citation' ? `${segment.content}-${index}` : `text-${index}`)}
    {#if segment.type === 'text'}
      {segment.content}
    {:else if segment.type === 'citation'}
      <CitationPreview
        citationKey={segment.content}
        {llm}
        {corpusName}
      />
    {/if}
  {/each}
</div>

<style>
  .text-with-citations {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
</style>
