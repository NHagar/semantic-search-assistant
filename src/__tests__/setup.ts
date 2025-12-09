import { beforeAll, afterAll, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

import { vi } from 'vitest';

// Mock LLM Client
vi.mock('../services/llm-client', () => ({
  llmClient: {
    chat: vi.fn().mockResolvedValue({
      choices: [{ message: { content: '**SEARCH PLAN #1**\nOBJECTIVE: Test Objective\n\nTest Content' } }]
    }),
    chatStream: async function* () { yield 'Mocked stream content'; },
    getAvailableModels: vi.fn().mockResolvedValue(['gpt-4', 'gpt-3.5-turbo']),
    embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
  }
}));

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = TEST_DB_PATH;
});

import { closeDb, resetDb } from '../db/client';

afterEach(() => {
  try {
    resetDb();
  } catch (err) {
    console.error('Failed to reset test database:', err);
  }
  closeDb();
  if (existsSync(TEST_DB_PATH)) {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch (err) {
      console.error('Failed to delete test database:', err);
    }
  }
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch (err) {
      console.error('Failed to delete test database:', err);
    }
  }
});
