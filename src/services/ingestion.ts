import { readFile, unlink } from 'fs/promises';
import { getDb } from '../db/client.js';
import { generateId } from '../utils/id.js';
import { extractTextFromBuffer } from './pdf-extractor.js';
import { vectorStore } from './vector-store.js';
import { countTokens } from './chunker.js';
import type { Document, UploadedFile } from '../types/index.js';

export class IngestionService {
    private static processingProjects = new Set<string>();

    static async processProjectFiles(projectId: string) {
        // Avoid running duplicate ingestion pipelines for the same project
        if (this.processingProjects.has(projectId)) {
            return { status: 'already_running' as const };
        }

        this.processingProjects.add(projectId);

        try {
            // 1. Extract Text
            const extractedDocs = await this.extractPendingFiles(projectId);

            // 2. Embed Documents
            // Only embed the ones we just extracted, or check all 'extracted' ones?
            // Checking all 'extracted' is safer and covers retries.
            const embeddedDocs = await this.embedProjectDocuments(projectId);

            return {
                status: 'completed' as const,
                extracted: extractedDocs,
                embedded: embeddedDocs,
            };
        } finally {
            this.processingProjects.delete(projectId);
        }
    }

    static async extractPendingFiles(projectId: string) {
        const db = getDb();
        const uploadedFiles = db.prepare(`
      SELECT * FROM uploaded_files
      WHERE project_id = ? AND status = 'pending'
    `).all(projectId) as UploadedFile[];

        const extracted: Document[] = [];
        const errors: Array<{ filename: string; error: string }> = [];

        for (const file of uploadedFiles) {
            try {
                db.prepare(`UPDATE uploaded_files SET status = 'processing' WHERE id = ?`).run(file.id);

                const buffer = await readFile(file.file_path);
                const result = await extractTextFromBuffer(buffer);

                const docId = generateId('doc');
                const tokenCount = countTokens(result.text);

                db.prepare(`
          INSERT INTO documents (id, project_id, filename, original_filename, content, file_size, page_count, token_count, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'extracted')
        `).run(docId, projectId, file.filename, file.original_filename, result.text, file.file_size, result.pageCount, tokenCount);

                db.prepare(`UPDATE uploaded_files SET status = 'completed' WHERE id = ?`).run(file.id);

                // Cleanup
                await unlink(file.file_path);
                db.prepare(`DELETE FROM uploaded_files WHERE id = ?`).run(file.id);

                const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(docId) as Document;
                extracted.push(doc);
            } catch (error) {
                console.error(`Error extracting file ${file.filename}:`, error);
                db.prepare(`UPDATE uploaded_files SET status = 'error' WHERE id = ?`).run(file.id);
                errors.push({ filename: file.filename, error: String(error) });
            }
        }

        return { extracted, errors };
    }

    static async embedProjectDocuments(projectId: string, options = { chunk_size: 512, overlap: 50 }) {
        const db = getDb();
        const documents = db.prepare(`
      SELECT * FROM documents
      WHERE project_id = ? AND status IN ('extracted', 'error')
    `).all(projectId) as Document[];

        const embedded: Array<{ id: string; filename: string; chunks: number }> = [];
        const errors: Array<{ filename: string; error: string }> = [];

        for (const doc of documents) {
            try {
                if (!doc.content) continue;

                const chunkCount = await vectorStore.embedDocument(
                    projectId,
                    doc.id,
                    doc.content,
                    options.chunk_size,
                    options.overlap
                );

                db.prepare(`
          UPDATE documents SET status = 'embedded', updated_at = datetime('now')
          WHERE id = ?
        `).run(doc.id);

                embedded.push({ id: doc.id, filename: doc.filename, chunks: chunkCount });
            } catch (error) {
                console.error(`Error embedding document ${doc.filename}:`, error);
                db.prepare(`
          UPDATE documents SET status = 'error', error_message = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(String(error), doc.id);
                errors.push({ filename: doc.filename, error: String(error) });
            }
        }

        return { embedded, errors };
    }
}
