import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(__dirname, '../../prompts');

function loadPrompt(name: string): string {
  return readFileSync(join(promptsDir, `${name}.md`), 'utf-8');
}

export const prompts = {
  compress: loadPrompt('compress'),
  plan: loadPrompt('plan'),
  search: loadPrompt('search'),
  evaluate: loadPrompt('evaluate'),
  synthesize: loadPrompt('synthesize'),
};
