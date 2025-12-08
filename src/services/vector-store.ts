import { getDb } from '../db/client.js';
import { embeddingService } from './embeddings.js';
import { chunkText, countTokens } from './chunker.js';
import { generateCitationKey } from '../utils/id.js';
import type { SearchResult, CitationSource, ChunkInsert } from '../types/index.js';

export class VectorStore {
  async insertChunks(chunks: ChunkInsert[]): Promise<void> {
    const db = getDb();

    const insertMeta = db.prepare(`
      INSERT INTO chunks (document_id, project_id, chunk_index, content, token_count, citation_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertVec = db.prepare(`
      INSERT INTO chunks_vec (chunk_id, embedding)
      VALUES (?, ?)
    `);

    db.transaction(() => {
      for (const chunk of chunks) {
        const result = insertMeta.run(
          chunk.documentId,
          chunk.projectId,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenCount,
          chunk.citationKey
        );

        const chunkId = result.lastInsertRowid;
        const embeddingBlob = new Float32Array(chunk.embedding);
        insertVec.run(chunkId, embeddingBlob);
      }
    })();
  }

  async embedDocument(
    projectId: string,
    documentId: string,
    content: string,
    chunkSize: number = 512,
    overlap: number = 50
  ): Promise<number> {
    // Chunk the content
    const chunks = chunkText(content, chunkSize, overlap);

    // Generate embeddings for all chunks
    const texts = chunks.map(c => c.content);
    const embeddings = await embeddingService.embedBatch(texts);

    // Prepare chunk inserts
    const chunkInserts: ChunkInsert[] = chunks.map((chunk, i) => ({
      documentId,
      projectId,
      chunkIndex: chunk.index,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      citationKey: generateCitationKey(documentId, chunk.index),
      embedding: embeddings[i],
    }));

    // Insert all chunks
    await this.insertChunks(chunkInserts);

    return chunks.length;
  }

  async search(
    projectId: string,
    query: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    const db = getDb();

    // Get query embedding
    const queryEmbedding = await embeddingService.embedQuery(query);
    const embeddingBlob = new Float32Array(queryEmbedding);

    // Search using sqlite-vec
    const stmt = db.prepare(`
      SELECT
        c.id,
        c.document_id,
        c.content,
        c.citation_key,
        c.chunk_index,
        d.filename,
        vec_distance_cosine(cv.embedding, ?) as distance
      FROM chunks_vec cv
      JOIN chunks c ON cv.chunk_id = c.id
      JOIN documents d ON c.document_id = d.id
      WHERE c.project_id = ?
      ORDER BY distance ASC
      LIMIT ?
    `);

    const results = stmt.all(embeddingBlob, projectId, limit) as Array<{
      id: number;
      document_id: string;
      content: string;
      citation_key: string;
      chunk_index: number;
      filename: string;
      distance: number;
    }>;

    return results.map(row => ({
      id: row.id,
      document_id: row.document_id,
      filename: row.filename,
      chunk_index: row.chunk_index,
      content: row.content,
      citation_key: row.citation_key,
      similarity: 1 - row.distance,
    }));
  }

  async getCitationSource(
    projectId: string,
    citationKey: string
  ): Promise<CitationSource | null> {
    const db = getDb();

    // Get the chunk with the citation key
    const chunk = db.prepare(`
      SELECT c.*, d.filename
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.project_id = ? AND c.citation_key = ?
    `).get(projectId, citationKey) as {
      id: number;
      document_id: string;
      chunk_index: number;
      content: string;
      citation_key: string;
      filename: string;
    } | undefined;

    if (!chunk) return null;

    // Get previous and next chunks
    const prevChunk = db.prepare(`
      SELECT content FROM chunks
      WHERE document_id = ? AND chunk_index = ?
    `).get(chunk.document_id, chunk.chunk_index - 1) as { content: string } | undefined;

    const nextChunk = db.prepare(`
      SELECT content FROM chunks
      WHERE document_id = ? AND chunk_index = ?
    `).get(chunk.document_id, chunk.chunk_index + 1) as { content: string } | undefined;

    return {
      citation_key: chunk.citation_key,
      filename: chunk.filename,
      chunk_index: chunk.chunk_index,
      content: chunk.content,
      previous_chunk: prevChunk?.content ?? null,
      next_chunk: nextChunk?.content ?? null,
    };
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    const db = getDb();

    db.transaction(() => {
      // Get chunk IDs
      const chunks = db.prepare(`
        SELECT id FROM chunks WHERE document_id = ?
      `).all(documentId) as Array<{ id: number }>;

      // Delete from vector table
      const deleteVec = db.prepare(`DELETE FROM chunks_vec WHERE chunk_id = ?`);
      for (const chunk of chunks) {
        deleteVec.run(chunk.id);
      }

      // Delete from chunks table
      db.prepare(`DELETE FROM chunks WHERE document_id = ?`).run(documentId);
    })();
  }

  async getProjectStats(projectId: string): Promise<{
    totalChunks: number;
    totalDocuments: number;
    filenames: string[];
  }> {
    const db = getDb();

    const stats = db.prepare(`
      SELECT COUNT(*) as total_chunks
      FROM chunks
      WHERE project_id = ?
    `).get(projectId) as { total_chunks: number };

    const docs = db.prepare(`
      SELECT DISTINCT d.filename
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.project_id = ?
    `).all(projectId) as Array<{ filename: string }>;

    return {
      totalChunks: stats.total_chunks,
      totalDocuments: docs.length,
      filenames: docs.map(d => d.filename),
    };
  }
}

export const vectorStore = new VectorStore();
