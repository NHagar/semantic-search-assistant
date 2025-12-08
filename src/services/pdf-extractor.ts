import pdf from 'pdf-parse';
import { readFile } from 'fs/promises';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  info: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
  };
}

export async function extractTextFromPdf(filePath: string): Promise<PdfExtractionResult> {
  const dataBuffer = await readFile(filePath);
  const data = await pdf(dataBuffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    info: {
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
      keywords: data.info?.Keywords,
    },
  };
}

export async function extractTextFromBuffer(buffer: Buffer): Promise<PdfExtractionResult> {
  const data = await pdf(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    info: {
      title: data.info?.Title,
      author: data.info?.Author,
      subject: data.info?.Subject,
      keywords: data.info?.Keywords,
    },
  };
}
