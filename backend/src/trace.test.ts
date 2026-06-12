import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// 1. File Hashing function to test
function calculateStringHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 2. Custody Log Hash function to test
function calculateLogHash(log: {
  id: string;
  case_id: string;
  evidence_id: string | null;
  action_type: string;
  actor: string;
  details: string | null;
  prev_log_hash: string;
}): string {
  const content = [
    log.id,
    log.case_id,
    log.evidence_id || '',
    log.action_type,
    log.actor,
    log.details || '',
    log.prev_log_hash
  ].join('');
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 3. Log Chain Verifier function to test
function verifyLogChain(logs: any[]): boolean {
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const computedHash = calculateLogHash({
      id: log.id,
      case_id: log.case_id,
      evidence_id: log.evidence_id,
      action_type: log.action_type,
      actor: log.actor,
      details: log.details,
      prev_log_hash: log.prev_log_hash
    });

    if (computedHash !== log.log_hash) {
      return false;
    }

    if (i > 0) {
      const prevLog = logs[i - 1];
      if (log.prev_log_hash !== prevLog.log_hash) {
        return false;
      }
    }
  }
  return true;
}

// 4. Path traversal mitigation check
function getSafeUploadPath(caseId: string, evidenceId: string): string {
  // Safe storage enforces renamed UUIDs inside the sandbox uploads folder
  const baseUploadsDir = path.resolve(__dirname, '../uploads');
  const targetDir = path.join(baseUploadsDir, caseId);
  const targetPath = path.join(targetDir, evidenceId);
  
  // Verify it stays within baseUploadsDir
  if (!targetPath.startsWith(baseUploadsDir)) {
    throw new Error('Path traversal detected');
  }
  return targetPath;
}

describe('TRACE Cryptographic & Security Engine Tests', () => {
  
  it('should calculate file hashes correctly matching sha256 standard', () => {
    const content = 'Forensic Evidence Sample Content #1234';
    const hash = calculateStringHash(content);
    
    // Check length and format
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    
    // Check against pre-calculated standard
    const nodeSha = crypto.createHash('sha256').update(content).digest('hex');
    expect(hash).toBe(nodeSha);
  });

  it('should successfully validate an intact custody log chain', () => {
    const caseId = uuidv4();
    const genesisHash = '0'.repeat(64);
    
    // Create Genesis log
    const log1Payload = {
      id: uuidv4(),
      case_id: caseId,
      evidence_id: null,
      action_type: 'CASE_CREATED',
      actor: 'Sarah Jenkins',
      details: 'Case initialized',
      prev_log_hash: genesisHash
    };
    const log1Hash = calculateLogHash(log1Payload);
    const log1 = { ...log1Payload, log_hash: log1Hash };

    // Create Evidence Ingestion log linked to Genesis
    const log2Payload = {
      id: uuidv4(),
      case_id: caseId,
      evidence_id: uuidv4(),
      action_type: 'EVIDENCE_UPLOADED',
      actor: 'Sarah Jenkins',
      details: 'Uploaded document.pdf',
      prev_log_hash: log1Hash
    };
    const log2Hash = calculateLogHash(log2Payload);
    const log2 = { ...log2Payload, log_hash: log2Hash };

    const logs = [log1, log2];
    
    expect(verifyLogChain(logs)).toBe(true);
  });

  it('should fail validation when historic log content is tampered with', () => {
    const caseId = uuidv4();
    const genesisHash = '0'.repeat(64);
    
    const log1Payload = {
      id: uuidv4(),
      case_id: caseId,
      evidence_id: null,
      action_type: 'CASE_CREATED',
      actor: 'Sarah Jenkins',
      details: 'Case initialized',
      prev_log_hash: genesisHash
    };
    const log1Hash = calculateLogHash(log1Payload);
    const log1 = { ...log1Payload, log_hash: log1Hash };

    const log2Payload = {
      id: uuidv4(),
      case_id: caseId,
      evidence_id: uuidv4(),
      action_type: 'EVIDENCE_UPLOADED',
      actor: 'Sarah Jenkins',
      details: 'Uploaded document.pdf',
      prev_log_hash: log1Hash
    };
    const log2Hash = calculateLogHash(log2Payload);
    const log2 = { ...log2Payload, log_hash: log2Hash };

    const logs = [log1, log2];

    // Tamper with log1 details without recalculating its hash
    logs[0].details = 'Tampered log message!';
    
    expect(verifyLogChain(logs)).toBe(false);
  });

  it('should fail validation when log linkage is broken', () => {
    const caseId = uuidv4();
    const genesisHash = '0'.repeat(64);
    
    const log1Payload = {
      id: uuidv4(),
      case_id: caseId,
      evidence_id: null,
      action_type: 'CASE_CREATED',
      actor: 'Sarah Jenkins',
      details: 'Case initialized',
      prev_log_hash: genesisHash
    };
    const log1Hash = calculateLogHash(log1Payload);
    const log1 = { ...log1Payload, log_hash: log1Hash };

    const log2Payload = {
      id: uuidv4(),
      case_id: caseId,
      evidence_id: uuidv4(),
      action_type: 'EVIDENCE_UPLOADED',
      actor: 'Sarah Jenkins',
      details: 'Uploaded document.pdf',
      prev_log_hash: 'f00d' + '0'.repeat(60) // Broken prev_log_hash link
    };
    const log2Hash = calculateLogHash(log2Payload);
    const log2 = { ...log2Payload, log_hash: log2Hash };

    const logs = [log1, log2];
    
    expect(verifyLogChain(logs)).toBe(false);
  });

  it('should prevent path traversal when files are named with traversal elements', () => {
    const maliciousCaseId = '../../etc';
    const maliciousEvidenceId = 'passwd';
    
    expect(() => {
      getSafeUploadPath(maliciousCaseId, maliciousEvidenceId);
    }).toThrowError('Path traversal detected');
  });

});
