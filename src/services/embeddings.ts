import { pipeline, env, type FeatureExtractionPipeline } from '@xenova/transformers';
import { config } from '../config/index.js';

// Configure for server-side use
env.cacheDir = './models';
env.allowLocalModels = true;

class EmbeddingService {
  private pipe: FeatureExtractionPipeline | null = null;
  private modelId: string;
  private dimension = 384;
  private initializing: Promise<void> | null = null;

  constructor() {
    this.modelId = config.EMBEDDING_MODEL;
  }

  async initialize(): Promise<void> {
    if (this.pipe) return;

    // Prevent multiple concurrent initializations
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = (async () => {
      console.log(`Loading embedding model: ${this.modelId}...`);
      this.pipe = await pipeline('feature-extraction', this.modelId);
      console.log('Embedding model loaded');
    })();

    await this.initializing;
    this.initializing = null;
  }

  async embed(texts: string[]): Promise<number[][]> {
    await this.initialize();
    if (!this.pipe) throw new Error('Embedding pipeline not initialized');

    const embeddings: number[][] = [];

    for (const text of texts) {
      // BGE models use prefix for document embeddings
      const prefixedText = `search_document: ${text}`;
      const output = await this.pipe(prefixedText, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract the embedding array
      const embedding = Array.from(output.data as Float32Array).slice(0, this.dimension);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    await this.initialize();
    if (!this.pipe) throw new Error('Embedding pipeline not initialized');

    // BGE models use different prefix for queries
    const prefixedQuery = `search_query: ${query}`;
    const output = await this.pipe(prefixedQuery, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data as Float32Array).slice(0, this.dimension);
  }

  async embedBatch(texts: string[], batchSize = 32): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await this.embed(batch);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  getDimension(): number {
    return this.dimension;
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
