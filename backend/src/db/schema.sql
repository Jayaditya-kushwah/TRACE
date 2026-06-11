-- Database schema for TRACE (Tamper-Resistant Record and Audit Chain for Evidence)

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Cases Table
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Evidence Table
CREATE TABLE IF NOT EXISTS evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processing_status VARCHAR(50) DEFAULT 'PENDING' NOT NULL
);

-- 3. Custody Logs Table (linked chain of custody)
CREATE TABLE IF NOT EXISTS custody_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- CASE_CREATED, EVIDENCE_UPLOADED, CUSTODY_TRANSFERRED, INTEGRITY_VERIFIED, SYSTEM_AUDIT
    actor VARCHAR(100) NOT NULL,
    details TEXT,
    prev_log_hash CHAR(64) NOT NULL,
    log_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes to optimize timeline and lookup loads
CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_custody_logs_case_id ON custody_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_custody_logs_evidence_id ON custody_logs(evidence_id);
CREATE INDEX IF NOT EXISTS idx_custody_logs_created_at ON custody_logs(created_at ASC);

-- =========================================================================
-- AI EVIDENCE INTELLIGENCE SCHEMAS
-- =========================================================================

-- Enable vector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Evidence OCR Table
CREATE TABLE IF NOT EXISTS evidence_ocr (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    extracted_text TEXT NOT NULL,
    language VARCHAR(10) DEFAULT 'eng' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_ocr_evidence_id ON evidence_ocr(evidence_id);

-- 2. Extracted Entities Table
CREATE TABLE IF NOT EXISTS extracted_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- 'NAME', 'PHONE', 'EMAIL', 'URL', 'UPI_ID', 'TXN_ID', 'DATE', 'TIME', 'ORGANIZATION'
    entity_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_case_id ON extracted_entities(case_id);
CREATE INDEX IF NOT EXISTS idx_entities_evidence_id ON extracted_entities(evidence_id);
CREATE INDEX IF NOT EXISTS idx_entities_type_value ON extracted_entities(entity_type, entity_value);

-- 3. Automated Timeline Events Table
CREATE TABLE IF NOT EXISTS investigation_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    confidence VARCHAR(10) CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')) NOT NULL,
    supporting_evidence_ids UUID[] DEFAULT '{}'::UUID[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timeline_events_case_id ON investigation_timeline_events(case_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_timestamp ON investigation_timeline_events(event_timestamp ASC);

-- 4. Case Summaries Table
CREATE TABLE IF NOT EXISTS case_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID UNIQUE NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    summary_content JSONB NOT NULL, -- { executive_summary: "", key_events: [], important_entities: [] }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. Evidence Embeddings Table (pgvector)
CREATE TABLE IF NOT EXISTS evidence_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL, -- 'OCR_TEXT', 'TIMELINE_EVENT', 'CASE_SUMMARY'
    raw_content TEXT NOT NULL,
    embedding VECTOR(768) NOT NULL, -- 768 dimensions for Google text-embedding-004
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embeddings_case_id ON evidence_embeddings(case_id);
-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON evidence_embeddings USING hnsw (embedding vector_cosine_ops);

-- Restricted database user to enforce immutability in operations (no DELETE or TRUNCATE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'trace_user') THEN
        CREATE ROLE trace_user WITH LOGIN PASSWORD 'trace_secure_pass';
    END IF;
END
$$;

-- Grant permissions (restricted to SELECT, INSERT, UPDATE only)
DO $$
BEGIN
    EXECUTE 'GRANT CONNECT ON DATABASE ' || quote_ident(current_database()) || ' TO trace_user';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not grant connect permissions on current database to trace_user';
END
$$;

GRANT USAGE ON SCHEMA public TO trace_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO trace_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO trace_user;
-- Revoke delete and truncate to explicitly block tampering by application user
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM trace_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE, TRUNCATE ON TABLES FROM trace_user;
