-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Cases Table
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_id VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Evidence Table
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Custody Logs Table
CREATE TABLE IF NOT EXISTS custody_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    details TEXT,
    prev_log_hash CHAR(64) NOT NULL,
    log_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. OCR Documents Table
CREATE TABLE IF NOT EXISTS ocr_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    extracted_text TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Extracted Entities Table
CREATE TABLE IF NOT EXISTS extracted_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL,
    entity_value VARCHAR(255) NOT NULL,
    context_snippet TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Timeline Events Table (AI advisory timeline)
CREATE TABLE IF NOT EXISTS timeline_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    explanation TEXT,
    source_evidence_ids UUID[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Case Summaries Table
CREATE TABLE IF NOT EXISTS case_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    cited_evidence_ids UUID[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Search Embeddings Table (pgvector)
CREATE TABLE IF NOT EXISTS search_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL, -- e.g., 'ocr', 'summary', 'entity'
    entity_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_custody_logs_case_id ON custody_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_custody_logs_evidence_id ON custody_logs(evidence_id);
CREATE INDEX IF NOT EXISTS idx_ocr_documents_evidence_id ON ocr_documents(evidence_id);
CREATE INDEX IF NOT EXISTS idx_extracted_entities_case_id ON extracted_entities(case_id);
CREATE INDEX IF NOT EXISTS idx_extracted_entities_evidence_id ON extracted_entities(evidence_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_case_id ON timeline_events(case_id);
CREATE INDEX IF NOT EXISTS idx_case_summaries_case_id ON case_summaries(case_id);
CREATE INDEX IF NOT EXISTS idx_search_embeddings_case_id ON search_embeddings(case_id);
