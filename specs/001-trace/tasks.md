# TRACE MVP Implementation Tasks (specs/001-trace/tasks.md)

## Phase 1: Environment & Database Setup

- [ ] **DB-01: Create PostgreSQL Database Schema**
  - [ ] Implement database initialization script containing definitions for `cases`, `evidence`, and `custody_logs` tables.
  - [ ] Configure indexes on foreign keys (`case_id`, `evidence_id`) to optimize timeline loads.
  - [ ] Create a database user with restricted permissions (restricted from `DELETE`/`TRUNCATE` tables where possible, to test immutability).
- [ ] **ENV-02: Project Boilerplate Scaffolding**
  - [ ] Initialize Node.js TypeScript project structure for the backend.
  - [ ] Configure TypeScript `tsconfig.json` for compilation to `dist/`.
  - [ ] Initialize React SPA with TypeScript and Tailwind CSS.
  - [ ] Set up cross-origin resource sharing (CORS) configurations between frontend and backend ports.

---

## Phase 2: Backend Core & Ingestion Engine

- [ ] **BE-01: Ingestion & Storage Setup**
  - [ ] Install and configure `multer` for multipart form processing.
  - [ ] Create directory structure `./uploads` on the server root.
  - [ ] Implement secure file saving routine: rename files to UUIDs, remove execution bits (`chmod 644`).
- [ ] **BE-02: Cryptographic Engine**
  - [ ] Implement a SHA-256 calculation utility using Node.js native `crypto` module that reads files as streams.
  - [ ] Write unit tests verifying calculated hashes against standard local terminal output `sha256sum`.
- [ ] **BE-03: Append-Only Logging Module**
  - [ ] Write a server-side service that pulls the latest event for a case and serializes the new log entry payload.
  - [ ] Implement the `log_hash` generator using the formula: $H_n = SHA256(fields + H_{prev})$.
  - [ ] Set database transactions for uploads: an evidence record must never be written without a corresponding `custody_log` insert.
- [ ] **BE-04: Ingestion APIs**
  - [ ] Implement `POST /api/cases` (creates case, writes initial log).
  - [ ] Implement `GET /api/cases` and `GET /api/cases/:id` (retrieves case details, evidence list, and raw logs).
  - [ ] Implement `POST /api/cases/:id/evidence` (upload file, write metadata, compute hash, insert custody event).

---

## Phase 3: Frontend Dashboard & Timeline Layout

- [ ] **FE-01: UI Shell & Theme Setup**
  - [ ] Configure Tailwind theme with premium dark mode palette (slate grays, slate-900 backgrounds, neon green/amber accents).
  - [ ] Build sidebar displaying the Case List and containing a "Create Case" button.
  - [ ] Implement case creation modal linked to `POST /api/cases`.
- [ ] **FE-02: Case View & Evidence Catalog**
  - [ ] Design the layout for the active case, showing Case Title, reference metadata, and empty states.
  - [ ] Implement evidence grid: render cards detailing file names, size in KB/MB, MIME type icon, and a click-to-copy hash bubble.
  - [ ] Design and implement the "Upload Evidence" drag-and-drop zone using standard HTML5 file drop API.
- [ ] **FE-03: Chronological Timeline Component**
  - [ ] Build a vertical, visual timeline UI component showing chronological nodes.
  - [ ] Map custody event codes (`CASE_CREATED`, `EVIDENCE_UPLOADED`, etc.) to specific icon nodes and formatted description copy.
  - [ ] Format timestamps in timeline to display cleanly in UTC.

---

## Phase 4: Custody Management & API Integrations

- [ ] **BE-05: Custody Transfer Endpoint**
  - [ ] Create `POST /api/evidence/:id/transfer` endpoint.
  - [ ] Validate body payload contains recipient name, actor name, and transfer reason.
  - [ ] Append a `CUSTODY_TRANSFERRED` event to the database, maintaining the hash chain.
- [ ] **FE-04: Custody Transfer Dialog**
  - [ ] Implement a "Transfer Custody" action modal on evidence cards.
  - [ ] Build form fields validating recipient name and transfer reason before executing the backend request.
  - [ ] Refresh the case view timeline automatically upon successful API response.

---

## Phase 5: Verification Engine

- [ ] **BE-06: Verification Engine Service**
  - [ ] Implement a file-checking service that recalculates the disk file hash and compares it to the DB value.
  - [ ] Implement the Hash-Chain Integrity scanner that traverses case logs ASC, validating that `prev_log_hash` matches previous calculations.
  - [ ] Create `POST /api/evidence/:id/verify` (or `/api/cases/:id/verify` for full case audit) returning verification status codes.
- [ ] **FE-05: Verification Interface Integration**
  - [ ] Build a prominent "Audit Case Integrity" action button in the case view header.
  - [ ] Bind loading states (spinners) and show visual verification cards:
    - [ ] Green "VERIFIED" badge if file is unaltered.
    - [ ] Red "TAMPERED" badge if file hash does not match database.
    - [ ] Yellow "MISSING" badge if file is deleted from server disk.
    - [ ] Red block alert banner: "AUDIT LOG CHAIN BROKEN" if validation check fails.

---

## Phase 6: Reporting & Archive Packaging

- [ ] **BE-07: PDF Report Compiler**
  - [ ] Integrate a PDF generation library (e.g., `pdfkit`).
  - [ ] Design a clean, high-contrast, dual-column PDF layout featuring case description, an evidence summary table, and a printed timeline.
  - [ ] Implement `GET /api/cases/:id/report` returning PDF stream with inline headers.
- [ ] **BE-08: ZIP Bundle Packager**
  - [ ] Integrate `archiver` zip compiler.
  - [ ] Write service compiling a ZIP containing:
    - [ ] `evidence/` directory containing files renamed to their original filenames.
    - [ ] `manifest.json` containing matching metadata dumps.
    - [ ] The generated case PDF report.
  - [ ] Implement `GET /api/cases/:id/bundle` to stream the compilation.
- [ ] **FE-06: Export triggers**
  - [ ] Create "Export PDF Report" and "Download Bundle" buttons on dashboard header.
  - [ ] Bind file download streaming to standard client anchor download.

---

## Phase 7: Simulation, Security Audit & Verification

- [ ] **TST-01: Simulated Discrepancy Audits**
  - [ ] **Test File Tampering:** Upload a test file. Manually append characters to the file on server disk. Trigger "Audit Case Integrity" in the UI. Confirm status changes to Red/Tampered.
  - [ ] **Test Database Tampering:** Manually update an evidence hash record in PostgreSQL. Trigger verification. Confirm status changes to Red/Tampered.
  - [ ] **Test Chain Break:** Manually modify the description of a historic log entry in the database. Trigger verification. Confirm warning displays "AUDIT LOG CHAIN BROKEN".
- [ ] **SEC-02: Path Traversal Defenses**
  - [ ] Write unit test verifying that uploading files named `../../etc/passwd` does not store files outside the designated uploads directory.
