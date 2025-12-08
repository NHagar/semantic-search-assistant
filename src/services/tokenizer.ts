import { get_encoding, type Tiktoken } from 'tiktoken';

let encoding: Tiktoken | null = null;

function getEncoding(): Tiktoken {
  if (!encoding) {
    encoding = get_encoding('cl100k_base');
  }
  return encoding;
}

export function countTokens(text: string): number {
  const enc = getEncoding();
  return enc.encode(text).length;
}

export function encodeText(text: string): Uint32Array {
  const enc = getEncoding();
  return enc.encode(text);
}

export function decodeTokens(tokens: Uint32Array): string {
  const enc = getEncoding();
  return new TextDecoder().decode(enc.decode(tokens));
}
