// Project types
export interface Project {
  id: string;
  project_name: string;
  model_text: string;
  model_embedding: string;
  corpus_synopsis: string | null;
  final_report: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  project_name: string;
  model_text: string;
  model_embedding?: string;
}

export interface UpdateProjectInput {
  project_name?: string;
  model_text?: string;
  corpus_synopsis?: string;
  final_report?: string;
}

// Document types
export interface Document {
  id: string;
  project_id: string;
  filename: string;
  original_filename: string | null;
  content: string | null;
  file_size: number | null;
  page_count: number | null;
  token_count: number | null;
  status: 'pending' | 'extracted' | 'embedded' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// Chunk types
export interface Chunk {
  id: number;
  document_id: string;
  project_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  citation_key: string;
  created_at: string;
}

export interface ChunkInsert {
  documentId: string;
  projectId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  citationKey: string;
  embedding: number[];
}

// Search types
export interface SearchResult {
  id: number;
  document_id: string;
  filename: string;
  chunk_index: number;
  content: string;
  citation_key: string;
  similarity: number;
}

export interface CitationSource {
  citation_key: string;
  filename: string;
  chunk_index: number;
  content: string;
  previous_chunk: string | null;
  next_chunk: string | null;
}

// Search plan types
export interface SearchPlan {
  id: string;
  project_id: string;
  plan_name: string;
  main_objective: string;
  content: string;
  is_selected: boolean;
  created_at: string;
  updated_at: string;
}

// Search report types
export interface SearchReport {
  id: string;
  project_id: string;
  search_plan_id: string;
  report_contents: string;
  passed_evaluation: boolean;
  evaluation_metadata: string | null;
  created_at: string;
  updated_at: string;
}

// Uploaded file types
export interface UploadedFile {
  id: string;
  project_id: string;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  created_at: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
