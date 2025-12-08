import { nanoid } from 'nanoid';
import { createHash } from 'crypto';

export function generateId(prefix?: string): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}

export function generateCitationKey(documentId: string, chunkIndex: number): string {
  const hash = createHash('md5')
    .update(documentId)
    .digest('hex')
    .slice(0, 6);
  return `${hash}:${chunkIndex}`;
}
