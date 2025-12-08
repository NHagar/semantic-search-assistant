import { countTokens, encodeText, decodeTokens } from './tokenizer.js';

export interface ChunkResult {
  content: string;
  tokenCount: number;
  index: number;
}

export function chunkText(
  text: string,
  chunkSize: number = 512,
  overlap: number = 50
): ChunkResult[] {
  const tokens = encodeText(text);
  const totalTokens = tokens.length;

  if (totalTokens <= chunkSize) {
    return [{
      content: text,
      tokenCount: totalTokens,
      index: 0,
    }];
  }

  const chunks: ChunkResult[] = [];
  let start = 0;
  let index = 0;

  while (start < totalTokens) {
    const end = Math.min(start + chunkSize, totalTokens);
    const chunkTokens = tokens.slice(start, end);
    const chunkText = decodeTokens(chunkTokens);

    chunks.push({
      content: chunkText,
      tokenCount: chunkTokens.length,
      index,
    });

    if (end >= totalTokens) break;

    start = end - overlap;
    index++;
  }

  return chunks;
}

export function sampleText(text: string, maxTokens: number): string {
  const tokens = encodeText(text);

  if (tokens.length <= maxTokens) {
    return text;
  }

  const sampledTokens = tokens.slice(0, maxTokens);
  return decodeTokens(sampledTokens);
}

export { countTokens };
