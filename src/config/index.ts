import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(5001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/semantic-search.db'),
  UPLOADS_PATH: z.string().default('./data/uploads'),
  LM_STUDIO_URL: z.string().default('http://localhost:1234/v1'),
  LM_STUDIO_API_KEY: z.string().default('lm_studio'),
  DEFAULT_MODEL: z.string().default('qwen/qwen3-14b'),
  EMBEDDING_MODEL: z.string().default('Xenova/bge-small-en-v1.5'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const config = envSchema.parse(process.env);

export type Config = z.infer<typeof envSchema>;
