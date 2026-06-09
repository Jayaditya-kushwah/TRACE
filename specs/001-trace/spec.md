# TRACE Specification (specs/001-trace/spec.md)

## 1. Executive Summary

TRACE (Tamper-Resistant Record and Audit Chain for Evidence) is a specialized chain-of-custody and evidence integrity platform designed to preserve, organize, verify, and track digital evidence throughout its lifecycle. TRACE ensures that from the moment digital evidence is ingested, it is cataloged, cryptographically hashed, and tracked via an append-only timeline. The platform targets compliance officers, forensic investigators, legal counsel, and law enforcement agencies who require ironclad verification of digital evidence integrity.

---

## 2. Problem Statement

Modern investigations and compliance procedures rely heavily on digital evidence, including screenshots, PDFs, emails, audio/video recordings, and chat exports. However, digital evidence is easily modified, deleted, or misplaced. 

Once evidence is shared across teams or external organizations, it becomes extremely difficult to prove:
1. **Origin & Timestamp:** Exactly when and by whom the evidence was collected.
2. **Custody:** Who accessed the evidence, who transferred it, and when.
3. **Integrity:** Whether the file was modified (accidentally or maliciously) after collection.

Current workflows frequently rely on spreadsheets, email threads, or shared directories that lack transparent audit trails, leaving evidence vulnerable to tampering or challenges in court or compliance audits.

---

## 3. Goals

### Primary Goals (MVP)
* **Cryptographic Guarantees:** Ensure that every uploaded file is uniquely identified and locked using SHA-256 hashing.
* **Verifiable Chain of Custody:** Log all custody actions (creation, transfer, view, export) in an append-only, sequential log.
* **Single-Step Integrity Audits:** Provide a clear, one-click mechanism to verify whether the files on disk match their original states.
* **Professional Reporting:** Generate court-ready PDF audit reports and downloadable zip packages containing raw files and metadata.

### Non-Goals for MVP
* Proving the authenticity of evidence *before* it enters the system (e.g., verifying that a screenshot is not AI-generated).
* Integrating with hardware-based cryptographic keys or hardware security modules (HSMs).
* Decentralized blockchain publication of logs.

---

## 4. Scope

### In Scope (MVP Features)
1. **Case Management:** Create and organize files into distinct cases.
2. **Evidence Ingestion:** Upload files and immediately generate unique SHA-256 signatures.
3. **Metadata Storage:** Record detailed upload information (filename, size, MIME type, owner).
4. **Chain-of-Custody Logging:** Maintain an immutable database log of all custody changes.
5. **Timeline Visualization:** Display a clean, chronological timeline of custody events.
6. **Integrity Auditing:** Perform real-time file hash validation and audit-log hash-chain validation.
7. **Report Export:** Generate structured, professional PDF reports detailing case metadata and timelines.
8. **Bundle Export:** Compile cases into a ZIP archive containing raw evidence, a JSON metadata manifest, and the PDF report.

### Out of Scope (Future Roadmap)
* Multi-factor authentication (MFA) and single sign-on (SSO).
* Advanced multi-tenant permission layers (e.g., cross-agency visibility rules).
* Automated malware analysis on uploaded files.
* Direct integration with forensic tools (e.g., EnCase, FTK).
* Large file optimizations (files > 5GB).

---

## 5. User Personas

### Persona A: Inspector Sarah Jenkins (Lead Forensic Investigator)
* **Context:** Works for a mid-sized corporate compliance department. Investigates internal fraud and data theft.
* **Goals:** Collect evidence from employee laptops, secure it immediately, and present a bulletproof timeline of custody to external legal counsel.
* **Frustrations:** Struggles with shared folders where IT personnel accidentally modify file timestamps, risking evidence admissibility.

### Persona B: Attorney David Vance (Corporate Counsel)
* **Context:** Defends or prosecutes corporate policy infractions in internal hearings or civil court.
* **Goals:** Quick access to the verification history of any document and a clean, printed PDF report summarizing who touched a file and when.
* **Frustrations:** Needs simple, non-technical explanations of file integrity (e.g., "The hash matches the upload hash") rather than raw database logs.

---

## 6. User Stories

1. **As an Investigator (Sarah),** I want to create a new Case in TRACE so that I can group related files and maintain a clean context for an active investigation.
2. **As an Investigator (Sarah),** I want to upload digital evidence files (e.g., PDFs, images) and have the system calculate a SHA-256 hash immediately so that I have a cryptographic record of the file's exact state at the moment of collection.
3. **As an Investigator (Sarah),** I want to transfer custody of an evidence file to another investigator in the system so that custody handoffs are explicitly recorded.
4. **As an Auditor or Attorney (David),** I want to view a chronological timeline of a case's custody history so that I can audit exactly who had access to the evidence.
5. **As an Auditor (David),** I want to click a single "Verify Integrity" button on a file so that I can prove the file has not been altered or deleted since ingestion.
6. **As an Investigator (Sarah),** I want to export a certified PDF custody report and a complete evidence bundle (ZIP) so that I can present them to law enforcement or court representatives.

---

## 7. Functional Requirements & Acceptance Criteria

### FR-01: Case Creation
* **Description:** The system must allow authenticated users to create a case with a title, reference number, and description.
* **Acceptance Criteria:**
  1. Creating a case generates a unique UUID in the database.
  2. The creation page requires a non-empty `Title` (3-100 characters) and a unique `Case Reference ID` (alphanumeric, 3-20 characters).
  3. Upon creation, a custody event is automatically appended to the log: `"Case Created by [User] at [Timestamp]"`.

### FR-02: Evidence Upload & Ingestion
* **Description:** The system must allow users to upload digital evidence files associated with an active case.
* **Acceptance Criteria:**
  1. The user can select a file from their local file system up to 100MB.
  2. The system blocks uploads if no case is selected.
  3. Files are stored on the server's local file system with an obfuscated filename (UUID) to prevent direct path traversal or metadata leakage.
  4. The database records the original filename, MIME type, file size in bytes, and creator.

### FR-03: SHA-256 Hash Generation
* **Description:** The system must calculate a SHA-256 hash of the uploaded file contents at the moment of upload.
* **Acceptance Criteria:**
  1. Hashing must be computed server-side immediately upon file receipt before saving to permanent storage.
  2. The generated hash must be a 64-character hexadecimal string.
  3. The hash must match the output of standard shell utility `sha256sum` run against the original uploaded file.

### FR-04: Metadata Storage
* **Description:** The system must store descriptive and technical metadata for all uploaded evidence.
* **Acceptance Criteria:**
  1. Evidence metadata must include: `id` (UUID), `case_id` (UUID), `original_filename` (string), `stored_filename` (string), `file_size_bytes` (integer), `mime_type` (string), `sha256_hash` (64-char hex), and `uploaded_at` (UTC timestamp).
  2. All metadata fields must be non-nullable except for custom user descriptions.

### FR-05: Custody Event Logging
* **Description:** The system must generate append-only logs for every critical system event.
* **Acceptance Criteria:**
  1. Every entry in the `custody_logs` table must be immutable (enforced via database level rules/triggers or clean application code).
  2. Logged actions must include: `CASE_CREATED`, `EVIDENCE_UPLOADED`, `CUSTODY_TRANSFERRED`, `EVIDENCE_VIEWED`, `INTEGRITY_VERIFIED`, and `BUNDLE_EXPORTED`.
  3. Each log record must contain a cryptographic link to the previous log record for that case (a hash of the previous log entry's contents), creating a local blockchain-like sequence.

### FR-06: Timeline View
* **Description:** The frontend must render a chronological timeline of all events associated with a case.
* **Acceptance Criteria:**
  1. The timeline must display events in descending order (newest first) or ascending order (selectable).
  2. Each event must show: Timestamp (formatted as YYYY-MM-DD HH:mm:ss UTC), Actor Name, Action Type, and a short message (e.g., "Sarah Jenkins transferred custody to Mark Gable").
  3. Events that involve evidence must show the original file name and the file's SHA-256 hash.

### FR-07: Evidence Integrity Verification
* **Description:** The system must verify the physical file on disk against the cryptographic metadata stored in the database.
* **Acceptance Criteria:**
  1. When verification is run, the backend must read the physical file on disk, compute its SHA-256 hash, and check it against the database `sha256_hash` record.
  2. If the hashes match, the UI displays a green "PASS: Hash Verified" badge with a verification timestamp.
  3. If the hashes do not match, the UI displays a red "FAIL: File Modified" badge.
  4. If the file is missing from the disk, the UI displays a yellow "FAIL: File Missing" badge.
  5. The verification engine must also validate the integrity of the audit log chain (re-hashing and traversing the link hashes). Any gap or modification in the log chain must trigger a red warning badge: "FAIL: Audit Log Chain Compromised".

### FR-08: PDF Report Generation
* **Description:** The system must compile case and custody data into a downloadable PDF report.
* **Acceptance Criteria:**
  1. The report must contain: Case Title, Reference ID, Description, Creation Date, Investigator List, and a complete tabular layout of all Evidence items with their corresponding SHA-256 hashes.
  2. It must print a chronologically ordered table of all Custody log events.
  3. The PDF must feature a "Verification Seal" indicating whether the case integrity check passed at the time of export.

### FR-09: Evidence Bundle Export
* **Description:** Users must be able to export a complete case container as a ZIP file.
* **Acceptance Criteria:**
  1. The ZIP archive must contain:
     * A folder `evidence/` containing all raw uploaded files named by their original names.
     * A file `manifest.json` containing the metadata of all evidence items (original filename, upload date, size, SHA-256 hash).
     * The generated PDF report.
  2. The ZIP file must download directly via the browser and be readable by standard operating system archive extractors.

---

## 8. Non-Functional Requirements

### NFR-01: Performance & Ingestion Latency
* **Ingestion:** File upload and SHA-256 hash calculation for a 50MB file must complete in less than 5 seconds on standard domestic connections (excluding network transit time).
* **Search and Filter:** Loading a case timeline with up to 1,000 events must render in under 500ms.

### NFR-02: Security
* **SQL Injection Prevention:** All database operations must use parameterized queries.
* **Path Traversal Prevention:** Uploaded files must be renamed to random UUIDs upon storage on the server, removing execution privileges on the target uploads directory.
* **Audit Immutability:** Application access tokens are restricted. The app must execute database actions with a role that cannot truncate the `custody_logs` table.

### NFR-03: Usability & Aesthetics
* **Design System:** Visual interface must use a sleek, modern dark mode palette (charcoals, deep blues, slate gray) with distinct, high-contrast states for warnings (red/amber/green).
* **Responsiveness:** Layout must adapt gracefully to viewport sizes down to 768px (tablets).

---

## 9. Constraints & Risks

### Constraints
* **Single-Node Deployment:** For the hackathon MVP, the server runs on a single host. No cloud-based load balancers or distributed storage mounts are used.
* **Browser Sandbox:** Hashing on the frontend can be done to show progress, but the official cryptographic authority is the backend server execution.

### Risks & Mitigations
* **Risk: Out of Disk Space**
  * *Mitigation:* Limit maximum upload size to 100MB per file and set a case quota of 1GB.
* **Risk: Uploading Malicious Executables**
  * *Mitigation:* Store uploaded files in an isolated folder outside the web root (`/var/data/trace/uploads` or local project folder `./uploads`) and disable execute permissions on that directory.
