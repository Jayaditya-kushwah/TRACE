# TRACE MVP Implementation Tasks (specs/001-trace/tasks.md)

## Phase 1: Environment & Database Setup

- [x] **DB-01: Create PostgreSQL Database Schema**
  - [x] Implement database initialization script containing definitions for `cases`, `evidence`, and `custody_logs` tables.
  - [x] Configure indexes on foreign keys (`case_id`, `evidence_id`) to optimize timeline loads.
  - [x] Create a database user with restricted permissions (restricted from `DELETE`/`TRUNCATE` tables where possible, to test immutability).
- [x] **ENV-02: Project Boilerplate Scaffolding**
  - [x] Initialize Node.js TypeScript project structure for the backend.
  - [x] Configure TypeScript `tsconfig.json` for compilation to `dist/`.
  - [x] Initialize React SPA with TypeScript and Tailwind CSS.
  - [x] Set up cross-origin resource sharing (CORS) configurations between frontend and backend ports.

---

## Phase 2: Backend Core & Ingestion Engine

- [x] **BE-01: Ingestion & Storage Setup**
  - [x] Install and configure `multer` for multipart form processing.
  - [x] Create directory structure `./uploads` on the server root.
  - [x] Implement secure file saving routine: rename files to UUIDs, remove execution bits (`chmod 644`).
- [x] **BE-02: Cryptographic Engine**
  - [x] Implement a SHA-256 calculation utility using Node.js native `crypto` module that reads files as streams.
  - [x] Write unit tests verifying calculated hashes against standard local terminal output `sha256sum`.
- [x] **BE-03: Append-Only Logging Module**
  - [x] Write a server-side service that pulls the latest event for a case and serializes the new log entry payload.
  - [x] Implement the `log_hash` generator using the formula: $H_n = SHA256(fields + H_{prev})$.
  - [x] Set database transactions for uploads: an evidence record must never be written without a corresponding `custody_log` insert.
- [x] **BE-04: Ingestion APIs**
  - [x] Implement `POST /api/cases` (creates case, writes initial log).
  - [x] Implement `GET /api/cases` and `GET /api/cases/:id` (retrieves case details, evidence list, and raw logs).
  - [x] Implement `POST /api/cases/:id/evidence` (upload file, write metadata, compute hash, insert custody event).

---

## Phase 3: Frontend Dashboard & Timeline Layout

- [x] **FE-01: UI Shell & Theme Setup**
  - [x] Configure Tailwind theme with premium dark mode palette (slate grays, slate-900 backgrounds, neon green/amber accents).
  - [x] Build sidebar displaying the Case List and containing a "Create Case" button.
  - [x] Implement case creation modal linked to `POST /api/cases`.
- [x] **FE-02: Case View & Evidence Catalog**
  - [x] Design the layout for the active case, showing Case Title, reference metadata, and empty states.
  - [x] Implement evidence grid: render cards detailing file names, size in KB/MB, MIME type icon, and a click-to-copy hash bubble.
  - [x] Design and implement the "Upload Evidence" drag-and-drop zone using standard HTML5 file drop API.
- [x] **FE-03: Chronological Timeline Component**
  - [x] Build a vertical, visual timeline UI component showing chronological nodes.
  - [x] Map custody event codes (`CASE_CREATED`, `EVIDENCE_UPLOADED`, etc.) to specific icon nodes and formatted description copy.
  - [x] Format timestamps in timeline to display cleanly in UTC.

---

## Phase 4: Custody Management & API Integrations

- [x] **BE-05: Custody Transfer Endpoint**
  - [x] Create `POST /api/evidence/:id/transfer` endpoint.
  - [x] Validate body payload contains recipient name, actor name, and transfer reason.
  - [x] Append a `CUSTODY_TRANSFERRED` event to the database, maintaining the hash chain.
- [x] **FE-04: Custody Transfer Dialog**
  - [x] Implement a "Transfer Custody" action modal on evidence cards.
  - [x] Build form fields validating recipient name and transfer reason before executing the backend request.
  - [x] Refresh the case view timeline automatically upon successful API response.

---

## Phase 5: Verification Engine

- [x] **BE-06: Verification Engine Service**
  - [x] Implement a file-checking service that recalculates the disk file hash and compares it to the DB value.
  - [x] Implement the Hash-Chain Integrity scanner that traverses case logs ASC, validating that `prev_log_hash` matches previous calculations.
  - [x] Create `POST /api/evidence/:id/verify` (or `/api/cases/:id/verify` for full case audit) returning verification status codes.
- [x] **FE-05: Verification Interface Integration**
  - [x] Build a prominent "Audit Case Integrity" action button in the case view header.
  - [x] Bind loading states (spinners) and show visual verification cards:
    - [x] Green "VERIFIED" badge if file is unaltered.
    - [x] Red "TAMPERED" badge if file hash does not match database.
    - [x] Yellow "MISSING" badge if file is deleted from server disk.
    - [x] Red block alert banner: "AUDIT LOG CHAIN BROKEN" if validation check fails.

---

## Phase 6: Reporting & Archive Packaging

- [x] **BE-07: PDF Report Compiler**
  - [x] Integrate a PDF generation library (e.g., `pdfkit`).
  - [x] Design a clean, high-contrast, dual-column PDF layout featuring case description, an evidence summary table, and a printed timeline.
  - [x] Implement `GET /api/cases/:id/report` returning PDF stream with inline headers.
- [x] **BE-08: ZIP Bundle Packager**
  - [x] Integrate `archiver` zip compiler.
  - [x] Write service compiling a ZIP containing:
    - [x] `evidence/` directory containing files renamed to their original filenames.
    - [x] `manifest.json` containing matching metadata dumps.
    - [x] The generated case PDF report.
  - [x] Implement `GET /api/cases/:id/bundle` to stream the compilation.
- [x] **FE-06: Export triggers**
  - [x] Create "Export PDF Report" and "Download Bundle" buttons on dashboard header.
  - [x] Bind file download streaming to standard client anchor download.

---

## Phase 7: Simulation, Security Audit & Verification

- [x] **TST-01: Simulated Discrepancy Audits**
  - [x] **Test File Tampering:** Upload a test file. Manually append characters to the file on server disk. Trigger "Audit Case Integrity" in the UI. Confirm status changes to Red/Tampered.
  - [x] **Test Database Tampering:** Manually update an evidence hash record in PostgreSQL. Trigger verification. Confirm status changes to Red/Tampered.
  - [x] **Test Chain Break:** Manually modify the description of a historic log entry in the database. Trigger verification. Confirm warning displays "AUDIT LOG CHAIN BROKEN".
- [x] **SEC-02: Path Traversal Defenses**
  - [x] Write unit test verifying that uploading files named `../../etc/passwd` does not store files outside the designated uploads directory.
