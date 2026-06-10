import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CustodyService } from "./custodyService.js";
import { pool } from "../db/index.js";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

describe("Custody Service Integration Tests", () => {
  let testCaseId: string;
  let testEvidenceId: string;
  const tempFilePath = path.join(__dirname, "temp-test-upload.txt");

  beforeAll(async () => {
    // Clear test tables to keep tests clean and deterministic using admin pool
    const adminConnectionString = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
    const adminPool = new Pool({
      connectionString: adminConnectionString,
    });
    await adminPool.query("TRUNCATE custody_logs, evidence, cases CASCADE");
    await adminPool.end();

    fs.writeFileSync(tempFilePath, "Sample digital forensic evidence source file.");
  });

  afterAll(async () => {
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    await pool.end();
  });

  it("creates a case and appends the genesis custody log", async () => {
    const refId = `REF-${Date.now()}`;
    const newCase = await CustodyService.createCase(
      refId,
      "Test Investigation",
      "Analyzing test parameters.",
      "Investigator Alpha"
    );

    expect(newCase.id).toBeDefined();
    expect(newCase.reference_id).toBe(refId);
    testCaseId = newCase.id;

    // Verify genesis log in database
    const logs = await CustodyService.getCustodyLogsByCase(newCase.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action_type).toBe("CASE_CREATED");
    expect(logs[0]!.prev_log_hash).toBe("0000000000000000000000000000000000000000000000000000000000000000");
    expect(logs[0]!.log_hash).toHaveLength(64);
  });

  it("adds evidence, calculates hash, writes file to disk, and logs to database", async () => {
    const evidence = await CustodyService.addEvidence(
      testCaseId,
      "forensic_image.txt",
      tempFilePath,
      "text/plain",
      45,
      "Investigator Alpha"
    );

    expect(evidence.id).toBeDefined();
    expect(evidence.sha256_hash).toHaveLength(64);
    testEvidenceId = evidence.id;

    // Verify file on disk exists in correct case folder
    const diskPath = path.join(UPLOADS_DIR, testCaseId, evidence.id);
    expect(fs.existsSync(diskPath)).toBe(true);
    expect(fs.readFileSync(diskPath, "utf-8")).toBe("Sample digital forensic evidence source file.");

    // Verify custody log updated
    const logs = await CustodyService.getCustodyLogsByCase(testCaseId);
    expect(logs).toHaveLength(2);
    expect(logs[1]!.action_type).toBe("EVIDENCE_UPLOADED");
    expect(logs[1]!.prev_log_hash).toBe(logs[0]!.log_hash);
  });

  it("transfers custody of evidence and maintains the hash chain link", async () => {
    const transferLog = await CustodyService.transferCustody(
      testEvidenceId,
      "Investigator Alpha",
      "Analyst Beta",
      "Analysis and transcription."
    );

    expect(transferLog.action_type).toBe("CUSTODY_TRANSFERRED");
    expect(transferLog.actor).toBe("Investigator Alpha");
    expect(transferLog.details).toContain("Analyst Beta");

    // Verify custody log count and hashes
    const logs = await CustodyService.getCustodyLogsByCase(testCaseId);
    expect(logs).toHaveLength(3);
    expect(logs[2]!.prev_log_hash).toBe(logs[1]!.log_hash);
  });

  it("verifies case integrity when no tampering occurred", async () => {
    const audit = await CustodyService.verifyCaseIntegrity(testCaseId);
    expect(audit.chain_integrity).toBe(true);
    expect(audit.evidence_status).toHaveLength(1);
    expect(audit.evidence_status[0]!.status).toBe("VERIFIED");
  });

  it("detects tampering when a file is modified on disk", async () => {
    const diskPath = path.join(UPLOADS_DIR, testCaseId, testEvidenceId);
    
    // Backup original contents
    const originalContent = fs.readFileSync(diskPath);
    
    // Tamper with file
    fs.writeFileSync(diskPath, "Tampered digital forensic evidence file contents.");

    const audit = await CustodyService.verifyCaseIntegrity(testCaseId);
    expect(audit.evidence_status[0]!.status).toBe("TAMPERED");

    // Restore file contents
    fs.writeFileSync(diskPath, originalContent);
  });

  it("detects tampering when the database record is altered", async () => {
    // Audit should pass initially when restored
    let audit = await CustodyService.verifyCaseIntegrity(testCaseId);
    expect(audit.evidence_status[0]!.status).toBe("VERIFIED");

    // Tamper with database evidence hash
    await pool.query("UPDATE evidence SET sha256_hash = $1 WHERE id = $2", [
      "1111111111111111111111111111111111111111111111111111111111111111",
      testEvidenceId,
    ]);

    audit = await CustodyService.verifyCaseIntegrity(testCaseId);
    expect(audit.evidence_status[0]!.status).toBe("TAMPERED");
  });

  it("detects when the hash chain link is broken", async () => {
    // Tamper with historical log entry details
    await pool.query(
      "UPDATE custody_logs SET details = 'Tampered log detail' WHERE action_type = 'CASE_CREATED'"
    );

    const audit = await CustodyService.verifyCaseIntegrity(testCaseId);
    expect(audit.chain_integrity).toBe(false);
  });
});
