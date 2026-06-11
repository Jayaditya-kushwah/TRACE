import { Router } from "express";
import multer from "multer";
import { CustodyService } from "../services/custodyService.js";
import { pool } from "../db/index.js";
import { calculateFileHash, calculateLogHash } from "../utils/crypto.js";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import * as archiverModule from "archiver";
import { v4 as uuidv4 } from "uuid";

const archiver = ((archiverModule as any).default || archiverModule) as any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

const router = Router();

// Configure multer to write files to the system's temp directory
const upload = multer({ dest: os.tmpdir() });

// 1. Create Case
router.post("/cases", async (req, res, next) => {
  try {
    const { reference_id, title, description, created_by } = req.body;
    if (!reference_id || !title || !created_by) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: reference_id, title, created_by",
      });
    }

    const newCase = await CustodyService.createCase(
      reference_id,
      title,
      description || "",
      created_by
    );

    res.status(201).json({ success: true, data: newCase });
  } catch (error: any) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Reference ID already exists",
      });
    }
    next(error);
  }
});

// 2. List Cases
router.get("/cases", async (req, res, next) => {
  try {
    const cases = await CustodyService.getCases();
    res.json({ success: true, data: cases });
  } catch (error) {
    next(error);
  }
});

// 3. Get Single Case (Details, Evidence catalog, and Timeline logs)
router.get("/cases/:id", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const caseDetails = await CustodyService.getCaseById(id);
    if (!caseDetails) {
      return res.status(404).json({ success: false, error: "Case not found" });
    }

    const evidence = await CustodyService.getEvidenceByCase(id);
    const logs = await CustodyService.getCustodyLogsByCase(id);

    res.json({
      success: true,
      data: {
        ...caseDetails,
        evidence,
        logs,
      },
    });
  } catch (error) {
    next(error);
  }
});

// 4. Ingest/Upload Evidence for a Case
router.post("/cases/:id/evidence", upload.single("file"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const { uploaded_by } = req.body;
    const file = req.file;

    if (!uploaded_by) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        error: "Missing required field: uploaded_by",
      });
    }

    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    // Path traversal defense: Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ success: false, error: "Invalid case ID format" });
    }

    // Path traversal defense for filename: ensure no traversal segments
    if (
      file.originalname.includes("/") ||
      file.originalname.includes("\\") ||
      file.originalname.includes("..")
    ) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ success: false, error: "Invalid file name structure" });
    }

    const caseDetails = await CustodyService.getCaseById(id);
    if (!caseDetails) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(404).json({ success: false, error: "Case not found" });
    }

    const newEvidence = await CustodyService.addEvidence(
      id,
      file.originalname,
      file.path,
      file.mimetype,
      file.size,
      uploaded_by
    );

    res.status(201).json({ success: true, data: newEvidence });
  } catch (error) {
    next(error);
  }
});

// 5. Transfer Custody of Evidence
router.post("/evidence/:id/transfer", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const { actor, recipient, reason } = req.body;

    if (!actor || !recipient || !reason) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: actor, recipient, reason",
      });
    }

    const newLog = await CustodyService.transferCustody(id, actor, recipient, reason);
    res.status(201).json({ success: true, data: newLog });
  } catch (error: any) {
    if (error.message === "Evidence not found") {
      return res.status(404).json({ success: false, error: error.message });
    }
    next(error);
  }
});

// 6. Verify Case Integrity / Audit
router.post("/cases/:id/verify", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const caseDetails = await CustodyService.getCaseById(id);
    if (!caseDetails) {
      return res.status(404).json({ success: false, error: "Case not found" });
    }

    const audit = await CustodyService.verifyCaseIntegrity(id);
    res.json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
});

// 7. Generate PDF Integrity Report
router.get("/cases/:id/report", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const caseDetails = await CustodyService.getCaseById(id);
    if (!caseDetails) {
      return res.status(404).json({ success: false, error: "Case not found" });
    }

    const evidence = await CustodyService.getEvidenceByCase(id);
    const logs = await CustodyService.getCustodyLogsByCase(id);
    const audit = await CustodyService.verifyCaseIntegrity(id);

    // Initialize PDF Document
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    // Stream PDF directly to response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="TRACE-Report-${caseDetails.reference_id}.pdf"`
    );
    doc.pipe(res);

    // Decorative Header Banner
    doc.rect(0, 0, 595.28, 80).fill("#0f172a"); // Dark slate background

    // Title text inside banner
    doc.fillColor("#10b981").fontSize(20).font("Helvetica-Bold").text("T R A C E", 50, 25);
    doc
      .fillColor("#94a3b8")
      .fontSize(10)
      .font("Helvetica")
      .text("Tamper-Resistant Record and Audit Chain for Evidence", 50, 48);

    doc.fillColor("#334155").text(`Case Reference: ${caseDetails.reference_id}`, 400, 35, {
      align: "right",
      width: 145,
    });

    // Reset layout position
    doc.y = 100;
    doc.fillColor("#0f172a");

    // Case Details Table / Box
    doc.fontSize(14).font("Helvetica-Bold").text("CASE PROFILE", 50, doc.y);
    doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).strokeColor("#cbd5e1").lineWidth(1).stroke();
    doc.y += 15;

    // Profile metadata
    doc.fontSize(10).font("Helvetica-Bold").text("Title: ", 50, doc.y, { continued: true });
    doc.font("Helvetica").text(caseDetails.title);

    doc.font("Helvetica-Bold").text("Description: ", 50, doc.y + 15, { continued: true });
    doc.font("Helvetica").text(caseDetails.description || "N/A");

    doc.font("Helvetica-Bold").text("Created By: ", 50, doc.y + 35, { continued: true });
    doc.font("Helvetica").text(`${caseDetails.created_by} on ${new Date(caseDetails.created_at).toUTCString()}`);

    doc.y += 60;

    // Integrity Status
    doc.fontSize(14).font("Helvetica-Bold").text("INTEGRITY SUMMARY", 50, doc.y);
    doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).strokeColor("#cbd5e1").stroke();
    doc.y += 15;

    const allFilesOk = audit.evidence_status.every((e) => e.status === "VERIFIED");
    const statusText =
      audit.chain_integrity && allFilesOk
        ? "SECURE / VERIFIED (All evidence integrity checks passed)"
        : "ALERT / TAMPERED (Audit fail or files altered)";
    const statusColor = audit.chain_integrity && allFilesOk ? "#10b981" : "#ef4444";

    doc.fontSize(11).font("Helvetica-Bold").fillColor(statusColor).text(statusText, 50, doc.y);
    doc.fillColor("#0f172a");

    doc.y += 20;

    // Evidence Catalog Table
    doc.fontSize(14).font("Helvetica-Bold").text("EVIDENCE CATALOG", 50, doc.y);
    doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).strokeColor("#cbd5e1").stroke();
    doc.y += 15;

    if (evidence.length === 0) {
      doc.fontSize(10).font("Helvetica-Oblique").text("No evidence files registered.", 50, doc.y);
      doc.y += 15;
    } else {
      // Header row
      doc.fontSize(9).font("Helvetica-Bold");
      doc.text("Filename", 50, doc.y, { width: 140 });
      doc.text("Size (Bytes)", 200, doc.y, { width: 70 });
      doc.text("Cryptographic SHA-256 Hash", 280, doc.y, { width: 200 });
      doc.text("Status", 490, doc.y, { width: 60 });
      doc.y += 15;

      doc.font("Helvetica").fontSize(8);
      for (const ev of evidence) {
        const fileAudit = audit.evidence_status.find((s) => s.id === ev.id);
        const evStatus = fileAudit?.status || "UNKNOWN";
        const evColor = evStatus === "VERIFIED" ? "#10b981" : "#ef4444";

        doc.fillColor("#0f172a").text(ev.original_filename, 50, doc.y, { width: 140 });
        doc.text(ev.file_size_bytes.toString(), 200, doc.y, { width: 70 });
        doc.font("Courier").text(ev.sha256_hash, 280, doc.y, { width: 200 }).font("Helvetica");

        doc.fillColor(evColor).text(evStatus, 490, doc.y, { width: 60 });
        doc.y += 18;

        // Page break if too low
        if (doc.y > 700) {
          doc.addPage();
          doc.y = 50;
        }
      }
    }

    doc.fillColor("#0f172a").y += 20;

    // Custody Chain Timeline
    doc.fontSize(14).font("Helvetica-Bold").text("CHAIN OF CUSTODY LOGS", 50, doc.y);
    doc.moveTo(50, doc.y + 5).lineTo(545, doc.y + 5).strokeColor("#cbd5e1").stroke();
    doc.y += 15;

    doc.fontSize(8);
    for (const log of logs) {
      doc.font("Helvetica-Bold").text(`[${new Date(log.created_at).toUTCString()}] - ${log.action_type}`, 50, doc.y);
      doc.font("Helvetica-Bold").text("Actor: ", 50, doc.y + 10, { continued: true });
      doc.font("Helvetica").text(log.actor, { continued: true });
      doc.font("Helvetica-Bold").text(" | Details: ", { continued: true });
      doc.font("Helvetica").text(log.details || "N/A");

      doc.font("Courier").fillColor("#475569").text(`Log Hash: ${log.log_hash}`, 60, doc.y + 20);
      doc.fillColor("#0f172a").y += 35;

      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }
    }

    doc.end();
  } catch (error) {
    next(error);
  }
});

// 8. Download Archive/ZIP Bundle
router.get("/cases/:id/bundle", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const caseDetails = await CustodyService.getCaseById(id);
    if (!caseDetails) {
      return res.status(404).json({ success: false, error: "Case not found" });
    }

    const evidence = await CustodyService.getEvidenceByCase(id);
    const logs = await CustodyService.getCustodyLogsByCase(id);
    const audit = await CustodyService.verifyCaseIntegrity(id);

    // Setup Zip streaming
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="TRACE-Bundle-${caseDetails.reference_id}.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err: any) => {
      throw err;
    });
    archive.pipe(res);

    // 1. Generate Case PDF Report into memory and append to Zip
    const reportDoc = new PDFDocument({ margin: 50, size: "A4" });
    const reportBuffers: Buffer[] = [];

    reportDoc.on("data", (chunk) => reportBuffers.push(chunk));

    // Compile PDF
    reportDoc.rect(0, 0, 595.28, 80).fill("#0f172a");
    reportDoc.fillColor("#10b981").fontSize(20).font("Helvetica-Bold").text("T R A C E", 50, 25);
    reportDoc
      .fillColor("#94a3b8")
      .fontSize(10)
      .font("Helvetica")
      .text("Tamper-Resistant Record and Audit Chain for Evidence", 50, 48);
    reportDoc.fillColor("#334155").text(`Case Reference: ${caseDetails.reference_id}`, 400, 35, {
      align: "right",
      width: 145,
    });

    reportDoc.y = 100;
    reportDoc.fillColor("#0f172a").fontSize(14).font("Helvetica-Bold").text("CASE PROFILE", 50, reportDoc.y);
    reportDoc
      .moveTo(50, reportDoc.y + 5)
      .lineTo(545, reportDoc.y + 5)
      .strokeColor("#cbd5e1")
      .lineWidth(1)
      .stroke();
    reportDoc.y += 15;
    reportDoc.fontSize(10).font("Helvetica-Bold").text("Title: ", 50, reportDoc.y, { continued: true });
    reportDoc.font("Helvetica").text(caseDetails.title);
    reportDoc.font("Helvetica-Bold").text("Description: ", 50, reportDoc.y + 15, { continued: true });
    reportDoc.font("Helvetica").text(caseDetails.description || "N/A");
    reportDoc.font("Helvetica-Bold").text("Created By: ", 50, reportDoc.y + 35, { continued: true });
    reportDoc
      .font("Helvetica")
      .text(`${caseDetails.created_by} on ${new Date(caseDetails.created_at).toUTCString()}`);

    reportDoc.y += 60;
    reportDoc.fontSize(14).font("Helvetica-Bold").text("INTEGRITY SUMMARY", 50, reportDoc.y);
    reportDoc
      .moveTo(50, reportDoc.y + 5)
      .lineTo(545, reportDoc.y + 5)
      .strokeColor("#cbd5e1")
      .stroke();
    reportDoc.y += 15;
    const allFilesOk = audit.evidence_status.every((e) => e.status === "VERIFIED");
    const statusText =
      audit.chain_integrity && allFilesOk
        ? "SECURE / VERIFIED (All evidence integrity checks passed)"
        : "ALERT / TAMPERED (Audit fail or files altered)";
    const statusColor = audit.chain_integrity && allFilesOk ? "#10b981" : "#ef4444";
    reportDoc.fontSize(11).font("Helvetica-Bold").fillColor(statusColor).text(statusText, 50, reportDoc.y);

    reportDoc.fillColor("#0f172a").y += 25;
    reportDoc.fontSize(14).font("Helvetica-Bold").text("EVIDENCE CATALOG", 50, reportDoc.y);
    reportDoc
      .moveTo(50, reportDoc.y + 5)
      .lineTo(545, reportDoc.y + 5)
      .strokeColor("#cbd5e1")
      .stroke();
    reportDoc.y += 15;

    if (evidence.length === 0) {
      reportDoc.fontSize(10).font("Helvetica-Oblique").text("No evidence files registered.", 50, reportDoc.y);
    } else {
      reportDoc.fontSize(9).font("Helvetica-Bold");
      reportDoc.text("Filename", 50, reportDoc.y, { width: 140 });
      reportDoc.text("Size (Bytes)", 200, reportDoc.y, { width: 70 });
      reportDoc.text("Cryptographic SHA-256 Hash", 280, reportDoc.y, { width: 200 });
      reportDoc.text("Status", 490, reportDoc.y, { width: 60 });
      reportDoc.y += 15;

      reportDoc.font("Helvetica").fontSize(8);
      for (const ev of evidence) {
        const fileAudit = audit.evidence_status.find((s) => s.id === ev.id);
        const evStatus = fileAudit?.status || "UNKNOWN";
        const evColor = evStatus === "VERIFIED" ? "#10b981" : "#ef4444";

        reportDoc.fillColor("#0f172a").text(ev.original_filename, 50, reportDoc.y, { width: 140 });
        reportDoc.text(ev.file_size_bytes.toString(), 200, reportDoc.y, { width: 70 });
        reportDoc.font("Courier").text(ev.sha256_hash, 280, reportDoc.y, { width: 200 }).font("Helvetica");
        reportDoc.fillColor(evColor).text(evStatus, 490, reportDoc.y, { width: 60 });
        reportDoc.y += 18;

        if (reportDoc.y > 700) {
          reportDoc.addPage();
          reportDoc.y = 50;
        }
      }
    }

    reportDoc.fillColor("#0f172a").y += 20;
    reportDoc.fontSize(14).font("Helvetica-Bold").text("CHAIN OF CUSTODY LOGS", 50, reportDoc.y);
    reportDoc
      .moveTo(50, reportDoc.y + 5)
      .lineTo(545, reportDoc.y + 5)
      .strokeColor("#cbd5e1")
      .stroke();
    reportDoc.y += 15;
    reportDoc.fontSize(8);
    for (const log of logs) {
      reportDoc
        .font("Helvetica-Bold")
        .text(`[${new Date(log.created_at).toUTCString()}] - ${log.action_type}`, 50, reportDoc.y);
      reportDoc.font("Helvetica-Bold").text("Actor: ", 50, reportDoc.y + 10, { continued: true });
      reportDoc.font("Helvetica").text(log.actor, { continued: true });
      reportDoc.font("Helvetica-Bold").text(" | Details: ", { continued: true });
      reportDoc.font("Helvetica").text(log.details || "N/A");
      reportDoc.font("Courier").fillColor("#475569").text(`Log Hash: ${log.log_hash}`, 60, reportDoc.y + 20);
      reportDoc.fillColor("#0f172a").y += 35;

      if (reportDoc.y > 700) {
        reportDoc.addPage();
        reportDoc.y = 50;
      }
    }

    reportDoc.end();

    // Wait for reportDoc generation to complete
    await new Promise<void>((resolve) => {
      reportDoc.on("end", () => {
        const fullBuffer = Buffer.concat(reportBuffers);
        archive.append(fullBuffer, { name: `report.pdf` });
        resolve();
      });
    });

    // 2. Append manifest.json metadata dump
    const manifest = {
      case: caseDetails,
      evidence: evidence,
      logs: logs,
      audit: {
        timestamp: new Date().toISOString(),
        chain_integrity: audit.chain_integrity,
        evidence_status: audit.evidence_status,
      },
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    // 3. Append hashes.json file
    const hashes = evidence.map((e) => ({
      file: e.original_filename,
      sha256: e.sha256_hash,
    }));
    archive.append(JSON.stringify(hashes, null, 2), { name: "hashes.json" });

    // 4. Append actual evidence files renamed back to their original names
    for (const ev of evidence) {
      const filePath = path.join(UPLOADS_DIR, id, ev.id);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `evidence/${ev.original_filename}` });
      }
    }

    // Done packaging, finalize Zip stream
    await archive.finalize();
  } catch (error) {
    next(error);
  }
});

// --- SIMULATION ENDPOINTS FOR TAMPERING & AUDIT TESTING ---

// 1. Corrupt File on Server Disk
router.post("/simulate/tamper-file", async (req, res, next) => {
  try {
    const { case_id, evidence_id } = req.body;
    if (!case_id || !evidence_id) {
      return res.status(400).json({ success: false, error: "Missing case_id or evidence_id" });
    }

    const filePath = path.join(UPLOADS_DIR, case_id, evidence_id);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: "Evidence file not found on disk" });
    }

    // Create backup if it doesn't exist yet, to allow restoration
    const backupPath = `${filePath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    // Append garbage bytes to file
    fs.appendFileSync(filePath, "\n[TAMPERED_GARBAGE_BYTES_APPENDED_BY_SIMULATION]");

    res.json({ success: true, message: "File tampered successfully on server disk" });
  } catch (error) {
    next(error);
  }
});

// 2. Corrupt DB Hash
router.post("/simulate/tamper-db-hash", async (req, res, next) => {
  try {
    const { evidence_id } = req.body;
    if (!evidence_id) {
      return res.status(400).json({ success: false, error: "Missing evidence_id" });
    }

    // Get current hash to back it up
    const result = await pool.query("SELECT sha256_hash FROM evidence WHERE id = $1", [evidence_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Evidence not found in database" });
    }

    const dummyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Dummy hash
    await pool.query("UPDATE evidence SET sha256_hash = $1 WHERE id = $2", [dummyHash, evidence_id]);

    res.json({ success: true, message: "Evidence database hash tampered successfully" });
  } catch (error) {
    next(error);
  }
});

// 3. Break Hash Chain (Modify historical log)
router.post("/simulate/tamper-log-chain", async (req, res, next) => {
  try {
    const { case_id, log_id } = req.body;
    if (!case_id || !log_id) {
      return res.status(400).json({ success: false, error: "Missing case_id or log_id" });
    }

    const result = await pool.query("SELECT * FROM custody_logs WHERE id = $1 AND case_id = $2", [log_id, case_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Custody log not found" });
    }

    // Modify details to break the hash validation
    await pool.query("UPDATE custody_logs SET details = $1 WHERE id = $2", [
      "Tampered historical log detail via Simulation Panel",
      log_id,
    ]);

    res.json({ success: true, message: "Historical custody log details tampered successfully (hash chain broken)" });
  } catch (error) {
    next(error);
  }
});

// 4. Restore everything to original state
router.post("/simulate/restore", async (req, res, next) => {
  try {
    const { case_id } = req.body;
    if (!case_id) {
      return res.status(400).json({ success: false, error: "Missing case_id" });
    }

    // 1. Restore files from backups if they exist
    const caseUploadsDir = path.join(UPLOADS_DIR, case_id);
    if (fs.existsSync(caseUploadsDir)) {
      const files = fs.readdirSync(caseUploadsDir);
      for (const file of files) {
        if (file.endsWith(".bak")) {
          const originalFileId = file.substring(0, file.length - 4);
          const originalPath = path.join(caseUploadsDir, originalFileId);
          const backupPath = path.join(caseUploadsDir, file);
          fs.copyFileSync(backupPath, originalPath);
          fs.unlinkSync(backupPath);
        }
      }
    }

    // 2. Restore DB hashes by recalculating from the restored files
    const evidenceList = await CustodyService.getEvidenceByCase(case_id);
    const { calculateFileHash, calculateLogHash } = await import("../utils/crypto.js");

    for (const ev of evidenceList) {
      const filePath = path.join(UPLOADS_DIR, case_id, ev.id);
      if (fs.existsSync(filePath)) {
        const fileHash = await calculateFileHash(filePath);
        await pool.query("UPDATE evidence SET sha256_hash = $1 WHERE id = $2", [fileHash, ev.id]);
      }
    }

    // 3. Rebuild the custody log chain (recalculate hashes in sequence)
    const logs = await CustodyService.getCustodyLogsByCase(case_id);
    let expectedPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";

    for (const log of logs) {
      let details = log.details;
      if (details?.startsWith("Tampered historical log detail")) {
        if (log.action_type === "CASE_CREATED") {
          const caseInfo = await CustodyService.getCaseById(case_id);
          details = `Case initialized with reference ID: ${caseInfo?.reference_id}`;
        } else if (log.action_type === "EVIDENCE_UPLOADED" && log.evidence_id) {
          const ev = evidenceList.find(e => e.id === log.evidence_id);
          details = `Evidence uploaded: ${ev?.original_filename} (Hash: ${ev?.sha256_hash.substring(0, 8)}...)`;
        } else if (log.action_type === "CUSTODY_TRANSFERRED" && log.evidence_id) {
          const ev = evidenceList.find(e => e.id === log.evidence_id);
          details = `Custody of file [${ev?.original_filename || "evidence"}] transferred.`;
        } else {
          details = `Case event logged.`;
        }
      }

      const logHash = calculateLogHash({
        id: log.id,
        case_id: log.case_id,
        evidence_id: log.evidence_id,
        action_type: log.action_type,
        actor: log.actor,
        details,
        prev_log_hash: expectedPrevHash,
      });

      await pool.query(
        "UPDATE custody_logs SET details = $1, prev_log_hash = $2, log_hash = $3 WHERE id = $4",
        [details, expectedPrevHash, logHash, log.id]
      );

      expectedPrevHash = logHash;
    }

    res.json({ success: true, message: "Case data and log chain successfully restored to pristine state" });
  } catch (error) {
    next(error);
  }
});

// 5. Seed Demo Case File
router.post("/simulate/seed-demo", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create Case
    const caseId = uuidv4();
    const referenceId = "CRIM-2026-X89";
    const title = "Operation Phantom Exfil";
    const description = "Investigation into intellectual property theft at Quantum Tech. Forensic analysis of suspect laptop image and encrypted USB drive backups indicating exfiltration of source code and employee registry database.";
    const createdBy = "Special Agent Miller";

    const caseQuery = `
      INSERT INTO cases (id, reference_id, title, description, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    await client.query(caseQuery, [caseId, referenceId, title, description, createdBy]);

    // 2. Genesis Log
    const log1Id = uuidv4();
    const details1 = "Case file initialized for Operation Phantom Exfil.";
    const prevHash1 = "0000000000000000000000000000000000000000000000000000000000000000";
    const logHash1 = calculateLogHash({
      id: log1Id,
      case_id: caseId,
      evidence_id: null,
      action_type: "CASE_CREATED",
      actor: createdBy,
      details: details1,
      prev_log_hash: prevHash1,
    });
    
    await client.query(`
      INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [log1Id, caseId, null, "CASE_CREATED", createdBy, details1, prevHash1, logHash1]);

    // Create case uploads dir
    const caseUploadsDir = path.join(UPLOADS_DIR, caseId);
    if (!fs.existsSync(caseUploadsDir)) {
      fs.mkdirSync(caseUploadsDir, { recursive: true });
    }

    // Helper to add mock evidence
    const addMockEvidenceHelper = async (params: {
      id: string;
      filename: string;
      mimeType: string;
      fileContent: string;
      uploadedBy: string;
      uploadDetails: string;
      prevHash: string;
    }) => {
      const filePath = path.join(caseUploadsDir, params.id);
      fs.writeFileSync(filePath, params.fileContent);
      fs.chmodSync(filePath, 0o644);
      const fileHash = await calculateFileHash(filePath);
      const stats = fs.statSync(filePath);

      await client.query(`
        INSERT INTO evidence (id, case_id, original_filename, stored_filename, file_size_bytes, mime_type, sha256_hash, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [params.id, caseId, params.filename, params.id, stats.size, params.mimeType, fileHash, params.uploadedBy]);

      const logId = uuidv4();
      const logHash = calculateLogHash({
        id: logId,
        case_id: caseId,
        evidence_id: params.id,
        action_type: "EVIDENCE_UPLOADED",
        actor: params.uploadedBy,
        details: params.uploadDetails.replace("{HASH}", fileHash.substring(0, 8)),
        prev_log_hash: params.prevHash,
      });

      await client.query(`
        INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [logId, caseId, params.id, "EVIDENCE_UPLOADED", params.uploadedBy, params.uploadDetails.replace("{HASH}", fileHash.substring(0, 8)), params.prevHash, logHash]);

      return { fileHash, logHash };
    };

    // 3. Add Evidence 1: Suspect Registry Backup
    const ev1Id = uuidv4();
    const ev1Res = await addMockEvidenceHelper({
      id: ev1Id,
      filename: "suspect_registry_backup.db",
      mimeType: "application/octet-stream",
      fileContent: "[Forensic Database Registry Backup - Suspect Laptop Partition X-100]",
      uploadedBy: "Special Agent Miller",
      uploadDetails: "Registry database retrieved from suspect's laptop (Model: X-100) during warrant execution. File hash: {HASH}...",
      prevHash: logHash1,
    });

    // 4. Transfer Evidence 1
    const log3Id = uuidv4();
    const details3 = "Transferred to Analyst Jessy Beta for partition analysis and registry key decoding.";
    const logHash3 = calculateLogHash({
      id: log3Id,
      case_id: caseId,
      evidence_id: ev1Id,
      action_type: "CUSTODY_TRANSFERRED",
      actor: "Special Agent Miller",
      details: details3,
      prev_log_hash: ev1Res.logHash,
    });
    await client.query(`
      INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [log3Id, caseId, ev1Id, "CUSTODY_TRANSFERRED", "Special Agent Miller", details3, ev1Res.logHash, logHash3]);

    // 5. Add Evidence 2: Quantum Source Code ZIP
    const ev2Id = uuidv4();
    const ev2Res = await addMockEvidenceHelper({
      id: ev2Id,
      filename: "quantum_source_code.zip",
      mimeType: "application/zip",
      fileContent: "[Mock Compressed Archive containing exfiltrated core proprietary source code repository]",
      uploadedBy: "Analyst Jessy Beta",
      uploadDetails: "Source code ZIP archive recovered from hidden partition during forensic imaging. File hash: {HASH}...",
      prevHash: logHash3,
    });

    // 6. Add Evidence 3: Product Blueprint Image
    const ev3Id = uuidv4();
    const ev3Res = await addMockEvidenceHelper({
      id: ev3Id,
      filename: "confidential_product_blueprint.png",
      mimeType: "image/png",
      fileContent: "[Forensic PNG Image Buffer representing stolen schematic blueprint blueprint.png]",
      uploadedBy: "Analyst Jessy Beta",
      uploadDetails: "Schematic image found in the deleted files buffer of the suspect drive. File hash: {HASH}...",
      prevHash: ev2Res.logHash,
    });

    // 7. Transfer Evidence 3
    const log6Id = uuidv4();
    const details6 = "Transferred to Officer Davis at vault room B for secure physical storage before trial.";
    const logHash6 = calculateLogHash({
      id: log6Id,
      case_id: caseId,
      evidence_id: ev3Id,
      action_type: "CUSTODY_TRANSFERRED",
      actor: "Analyst Jessy Beta",
      details: details6,
      prev_log_hash: ev3Res.logHash,
    });
    await client.query(`
      INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [log6Id, caseId, ev3Id, "CUSTODY_TRANSFERRED", "Analyst Jessy Beta", details6, ev3Res.logHash, logHash6]);

    await client.query("COMMIT");
    res.json({ success: true, case_id: caseId });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

export default router;
