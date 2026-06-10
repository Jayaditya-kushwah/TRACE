import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db/index.js";
import { calculateFileHash, calculateLogHash } from "../utils/crypto.js";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define directories
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

// Enforce uploads directory existence
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface Case {
  id: string;
  reference_id: string;
  title: string;
  description: string;
  created_by: string;
  created_at: Date;
}

export interface Evidence {
  id: string;
  case_id: string;
  original_filename: string;
  stored_filename: string;
  file_size_bytes: number;
  mime_type: string;
  sha256_hash: string;
  uploaded_by: string;
  uploaded_at: Date;
}

export interface CustodyLog {
  id: string;
  case_id: string;
  evidence_id: string | null;
  action_type: string;
  actor: string;
  details: string | null;
  prev_log_hash: string;
  log_hash: string;
  created_at: Date;
}

export interface CaseVerificationResult {
  chain_integrity: boolean;
  chain_error_at?: string;
  evidence_status: Array<{
    id: string;
    original_filename: string;
    sha256_hash: string;
    file_exists: boolean;
    recalculated_hash: string | null;
    status: "VERIFIED" | "TAMPERED" | "MISSING";
  }>;
}

export class CustodyService {
  /**
   * Create a new case and initialize its genesis custody log.
   */
  static async createCase(
    referenceId: string,
    title: string,
    description: string,
    createdBy: string
  ): Promise<Case> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const caseId = uuidv4();
      const newCaseQuery = `
        INSERT INTO cases (id, reference_id, title, description, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const caseResult = await client.query(newCaseQuery, [
        caseId,
        referenceId,
        title,
        description,
        createdBy,
      ]);
      const createdCase: Case = caseResult.rows[0];

      // Create initial custody log entry
      const logId = uuidv4();
      const actionType = "CASE_CREATED";
      const details = `Case initialized with reference ID: ${referenceId}`;
      const prevLogHash = "0000000000000000000000000000000000000000000000000000000000000000";

      const logHash = calculateLogHash({
        id: logId,
        case_id: caseId,
        evidence_id: null,
        action_type: actionType,
        actor: createdBy,
        details,
        prev_log_hash: prevLogHash,
      });

      const newLogQuery = `
        INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      await client.query(newLogQuery, [
        logId,
        caseId,
        null,
        actionType,
        createdBy,
        details,
        prevLogHash,
        logHash,
      ]);

      await client.query("COMMIT");
      return createdCase;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieve all cases.
   */
  static async getCases(): Promise<Case[]> {
    const result = await pool.query("SELECT * FROM cases ORDER BY created_at DESC");
    return result.rows;
  }

  /**
   * Get details of a single case.
   */
  static async getCaseById(id: string): Promise<Case | null> {
    const result = await pool.query("SELECT * FROM cases WHERE id = $1", [id]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Get evidence list for a case.
   */
  static async getEvidenceByCase(caseId: string): Promise<Evidence[]> {
    const result = await pool.query(
      "SELECT * FROM evidence WHERE case_id = $1 ORDER BY uploaded_at DESC",
      [caseId]
    );
    return result.rows;
  }

  /**
   * Get custody logs for a case.
   */
  static async getCustodyLogsByCase(caseId: string): Promise<CustodyLog[]> {
    const result = await pool.query(
      "SELECT * FROM custody_logs WHERE case_id = $1 ORDER BY created_at ASC",
      [caseId]
    );
    return result.rows;
  }

  /**
   * Ingest and save an evidence file, insert database record, and link it to the custody timeline.
   */
  static async addEvidence(
    caseId: string,
    originalFilename: string,
    tempFilePath: string,
    mimeType: string,
    fileSize: number,
    uploadedBy: string
  ): Promise<Evidence> {
    const client = await pool.connect();
    try {
      // Create subfolder for case
      const caseUploadsDir = path.join(UPLOADS_DIR, caseId);
      if (!fs.existsSync(caseUploadsDir)) {
        fs.mkdirSync(caseUploadsDir, { recursive: true });
      }

      // Generate evidence UUID
      const evidenceId = uuidv4();
      const targetPath = path.join(caseUploadsDir, evidenceId);

      // Move temporary file to final path
      try {
        fs.renameSync(tempFilePath, targetPath);
      } catch (err: any) {
        if (err.code === "EXDEV") {
          fs.copyFileSync(tempFilePath, targetPath);
          fs.unlinkSync(tempFilePath);
        } else {
          throw err;
        }
      }

      // Remove executable permissions (chmod 644)
      fs.chmodSync(targetPath, 0o644);

      // Calculate file SHA-256 hash
      const fileHash = await calculateFileHash(targetPath);

      await client.query("BEGIN");

      // Retrieve previous log hash (for the current case)
      const prevLogQuery = `
        SELECT log_hash FROM custody_logs 
        WHERE case_id = $1 
        ORDER BY created_at DESC LIMIT 1
      `;
      const prevLogResult = await client.query(prevLogQuery, [caseId]);
      const prevLogHash = prevLogResult.rows[0]?.log_hash || "0000000000000000000000000000000000000000000000000000000000000000";

      // Insert evidence record
      const insertEvidenceQuery = `
        INSERT INTO evidence (id, case_id, original_filename, stored_filename, file_size_bytes, mime_type, sha256_hash, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const evidenceResult = await client.query(insertEvidenceQuery, [
        evidenceId,
        caseId,
        originalFilename,
        evidenceId, // stored on disk as evidence UUID
        fileSize,
        mimeType,
        fileHash,
        uploadedBy,
      ]);
      const newEvidence: Evidence = evidenceResult.rows[0];

      // Insert custody log entry
      const logId = uuidv4();
      const actionType = "EVIDENCE_UPLOADED";
      const details = `Evidence uploaded: ${originalFilename} (Hash: ${fileHash.substring(0, 8)}...)`;

      const logHash = calculateLogHash({
        id: logId,
        case_id: caseId,
        evidence_id: evidenceId,
        action_type: actionType,
        actor: uploadedBy,
        details,
        prev_log_hash: prevLogHash,
      });

      const insertLogQuery = `
        INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      await client.query(insertLogQuery, [
        logId,
        caseId,
        evidenceId,
        actionType,
        uploadedBy,
        details,
        prevLogHash,
        logHash,
      ]);

      await client.query("COMMIT");
      return newEvidence;
    } catch (error) {
      await client.query("ROLLBACK");
      // Clean up file if database failed
      try {
        const potentialPath = path.join(UPLOADS_DIR, caseId, originalFilename);
        if (fs.existsSync(potentialPath)) fs.unlinkSync(potentialPath);
      } catch (_) {}
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Transfer custody of evidence to another recipient.
   */
  static async transferCustody(
    evidenceId: string,
    actor: string,
    recipient: string,
    reason: string
  ): Promise<CustodyLog> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get evidence details
      const evidenceResult = await client.query("SELECT * FROM evidence WHERE id = $1", [evidenceId]);
      if (evidenceResult.rows.length === 0) {
        throw new Error("Evidence not found");
      }
      const evidence: Evidence = evidenceResult.rows[0];
      const caseId = evidence.case_id;

      // Get latest custody log for the case
      const prevLogQuery = `
        SELECT log_hash FROM custody_logs 
        WHERE case_id = $1 
        ORDER BY created_at DESC LIMIT 1
      `;
      const prevLogResult = await client.query(prevLogQuery, [caseId]);
      const prevLogHash = prevLogResult.rows[0]?.log_hash || "0000000000000000000000000000000000000000000000000000000000000000";

      // Insert custody transfer log
      const logId = uuidv4();
      const actionType = "CUSTODY_TRANSFERRED";
      const details = `Custody of file [${evidence.original_filename}] transferred to: ${recipient}. Reason: ${reason}`;

      const logHash = calculateLogHash({
        id: logId,
        case_id: caseId,
        evidence_id: evidenceId,
        action_type: actionType,
        actor,
        details,
        prev_log_hash: prevLogHash,
      });

      const insertLogQuery = `
        INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const logResult = await client.query(insertLogQuery, [
        logId,
        caseId,
        evidenceId,
        actionType,
        actor,
        details,
        prevLogHash,
        logHash,
      ]);

      await client.query("COMMIT");
      return logResult.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Recalculates all file hashes and audits the entire database log chain for a case.
   */
  static async verifyCaseIntegrity(caseId: string): Promise<CaseVerificationResult> {
    const evidenceList = await this.getEvidenceByCase(caseId);
    const logs = await this.getCustodyLogsByCase(caseId);

    const evidenceStatus: CaseVerificationResult["evidence_status"] = [];

    // 1. Audit files on disk
    for (const ev of evidenceList) {
      const filePath = path.join(UPLOADS_DIR, caseId, ev.id);
      const fileExists = fs.existsSync(filePath);

      let status: "VERIFIED" | "TAMPERED" | "MISSING" = "MISSING";
      let recalculatedHash: string | null = null;

      if (fileExists) {
        try {
          recalculatedHash = await calculateFileHash(filePath);
          if (recalculatedHash === ev.sha256_hash) {
            status = "VERIFIED";
          } else {
            status = "TAMPERED";
          }
        } catch (_) {
          status = "TAMPERED";
        }
      }

      evidenceStatus.push({
        id: ev.id,
        original_filename: ev.original_filename,
        sha256_hash: ev.sha256_hash,
        file_exists: fileExists,
        recalculated_hash: recalculatedHash,
        status,
      });
    }

    // 2. Audit the hash chain
    let chainIntegrity = true;
    let chainErrorAt: string | undefined = undefined;
    let expectedPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";

    for (const log of logs) {
      // Validate link to previous log
      if (log.prev_log_hash !== expectedPrevHash) {
        chainIntegrity = false;
        chainErrorAt = log.id;
        break;
      }

      // Recalculate hash of current log
      const computedHash = calculateLogHash({
        id: log.id,
        case_id: log.case_id,
        evidence_id: log.evidence_id,
        action_type: log.action_type,
        actor: log.actor,
        details: log.details,
        prev_log_hash: log.prev_log_hash,
      });

      if (computedHash !== log.log_hash) {
        chainIntegrity = false;
        chainErrorAt = log.id;
        break;
      }

      expectedPrevHash = log.log_hash;
    }

    // Insert an INTEGRITY_VERIFIED custody log entry upon successful audit
    if (chainIntegrity && evidenceStatus.every(e => e.status === "VERIFIED")) {
      try {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // Get latest log hash
          const prevLogQuery = `
            SELECT log_hash FROM custody_logs 
            WHERE case_id = $1 
            ORDER BY created_at DESC LIMIT 1
          `;
          const prevLogResult = await client.query(prevLogQuery, [caseId]);
          const latestLogHash = prevLogResult.rows[0]?.log_hash || "0000000000000000000000000000000000000000000000000000000000000000";

          const logId = uuidv4();
          const actionType = "INTEGRITY_VERIFIED";
          const details = `Full case integrity check executed: All files verified and log chain intact.`;

          const logHash = calculateLogHash({
            id: logId,
            case_id: caseId,
            evidence_id: null,
            action_type: actionType,
            actor: "System Audit Service",
            details,
            prev_log_hash: latestLogHash,
          });

          const insertLogQuery = `
            INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `;
          await client.query(insertLogQuery, [
            logId,
            caseId,
            null,
            actionType,
            "System Audit Service",
            details,
            latestLogHash,
            logHash,
          ]);
          await client.query("COMMIT");
        } catch (_) {
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      } catch (e) {
        console.error("Failed to append integrity verification audit log:", e);
      }
    }

    const verificationResult: CaseVerificationResult = {
      chain_integrity: chainIntegrity,
      evidence_status: evidenceStatus,
    };

    if (chainErrorAt !== undefined) {
      verificationResult.chain_error_at = chainErrorAt;
    }

    return verificationResult;
  }
}
