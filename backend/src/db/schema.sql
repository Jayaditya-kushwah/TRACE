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
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
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

-- Restricted database user to enforce immutability in operations (no DELETE or TRUNCATE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'trace_user') THEN
        CREATE ROLE trace_user WITH LOGIN PASSWORD 'trace_secure_pass';
    END IF;
END
$$;

-- Grant permissions (restricted to SELECT, INSERT, UPDATE only)
GRANT CONNECT ON DATABASE trace TO trace_user;
GRANT USAGE ON SCHEMA public TO trace_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO trace_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO trace_user;
-- Revoke delete and truncate to explicitly block tampering by application user
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM trace_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE, TRUNCATE ON TABLES FROM trace_user;
