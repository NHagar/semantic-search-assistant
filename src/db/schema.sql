-- Semantic Search Assistant Database Schema
-- SQLite with sqlite-vec for vector operations

PRAGMA foreign_keys = ON;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    project_name TEXT UNIQUE NOT NULL,
    model_text TEXT NOT NULL,
    model_embedding TEXT NOT NULL DEFAULT 'Xenova/bge-small-en-v1.5',
    corpus_synopsis TEXT,
    final_report TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(project_name);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT,
    content TEXT,
    file_size INTEGER,
    page_count INTEGER,
    token_count INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Chunks metadata table (linked to vector table)
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    citation_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_chunks_citation ON chunks(citation_key);

-- Search plans table
CREATE TABLE IF NOT EXISTS search_plans (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plan_name TEXT NOT NULL,
    main_objective TEXT NOT NULL,
    content TEXT NOT NULL,
    is_selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, plan_name)
);

CREATE INDEX IF NOT EXISTS idx_search_plans_project ON search_plans(project_id);

-- Search reports table
CREATE TABLE IF NOT EXISTS search_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    search_plan_id TEXT NOT NULL REFERENCES search_plans(id) ON DELETE CASCADE,
    report_contents TEXT NOT NULL,
    passed_evaluation INTEGER DEFAULT 0,
    evaluation_metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_reports_project ON search_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_search_reports_plan ON search_reports(search_plan_id);

-- Search queries audit table
CREATE TABLE IF NOT EXISTS search_queries (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES search_reports(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    results_returned TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_queries_report ON search_queries(report_id);

-- Uploaded files staging table
CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_project ON uploaded_files(project_id);
