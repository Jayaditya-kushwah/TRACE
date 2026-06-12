# TRACE Constitution

This document defines the core principles, standards, and rules governing the development, architecture, and evolution of TRACE (Tamper-Resistant Record and Audit Chain for Evidence). All contributors and automated agents must adhere to this constitution.

---

## 1. Project Philosophy

TRACE is designed to establish absolute, verifiable, and tamper-resistant chain-of-custody tracking for digital evidence. The core belief guiding TRACE is that **integrity, transparency, and accountability are non-negotiable** when handling forensic and compliance data. 

TRACE does not verify the authenticity of a physical or digital artifact *before* it enters the system; rather, it guarantees that once an artifact is registered in TRACE, its state, metadata, and custody history are immutably tracked and verified.

---

## 2. Security-First Principles

Because TRACE manages sensitive evidence, security is built into the architecture from day one:
* **Principle of Least Privilege:** Users can only access, view, or transfer evidence they are explicitly authorized to manage.
* **Cryptographic Anchoring:** Every piece of evidence is cryptographically bound to its unique SHA-256 hash. Hashing is done at the earliest point of ingestion to prevent silent modification.
* **Immutability of History:** Audit logs and custody records are read-only and append-only. There is no `UPDATE` or `DELETE` mechanism for audit logs in the application.
* **Defense in Depth:** Input validation, parameterization of database queries, strict CORS policies, and secure headers are mandatory.

---

## 3. Evidence Integrity Principles

To maintain trust, the system must guarantee:
1. **Zero Raw Modification:** Once an evidence file is uploaded, the storage backend must treat it as read-only.
2. **Deterministic Hashing:** SHA-256 hashes must be computed deterministically. File content must match the hash exactly at any point in the future.
3. **Chain-of-Custody Continuity:** Any transfer of custody or modification of evidence status must create a linked audit event containing:
   * Timestamp (server-verified UTC)
   * Actor ID (who initiated the action)
   * Action Type (creation, access, transfer, verification, export)
   * Integrity State (whether the hash currently matches the file)
   * Cryptographic Link (previous event hash to prevent reordering of logs)

---

## 4. Coding Standards

* **Language Stack:** TypeScript for both Frontend (React) and Backend (Node.js/Express) to ensure type safety across the network boundary.
* **State Management:** React state or lightweight context. Avoid complex state management tools unless strictly required.
* **Styling:** Tailwind CSS using semantic class grouping. Follow the project's central design system tokens (colors, spacing, typography) rather than ad-hoc configurations.
* **Database Access:** PostgreSQL utilizing pg-promise or a lightweight query builder with strict type parameters. Raw queries must be fully parameterized to prevent SQL injection.
* **Asynchronous Safety:** Always handle Promise rejections and use structured try/catch blocks in Express endpoints to prevent server crashes and leaking stack traces.

---

## 5. Documentation Standards

* **In-Repo Specification (SpecKit SDD):** The source of truth for requirements, plans, and tasks lives in `/specs` and `.specify/`.
* **Synchronized Documentation:** Any changes to the database schema, APIs, or functional scope must be updated in `plan.md` and `spec.md` before implementation begins.
* **Clear Docstrings:** Document all utility functions, cryptographic routines, and database models with JSDoc headers.

---

## 6. MVP-First Philosophy & Scope Control

* **Radical Simplification:** The MVP must focus strictly on the nine core capabilities: Case Creation, Evidence Upload, SHA-256 Hashing, Metadata Storage, Custody Logging, Timeline View, Integrity Verification, PDF Report, and Bundle Export.
* **No Blockchain for MVP:** Immutability will be demonstrated via database schema constraints, append-only logs, and SHA-256 hash chaining of audit logs. Advanced decentralized architectures are deferred to the long-term vision.
* **Local Storage:** The MVP will use local directory storage for evidence files rather than S3 or cloud providers to minimize infrastructure complexity and deployment latency.
* **Demonstrability over Scale:** When choosing between a complex, distributed setup and a simple, highly visual, working local setup, prioritize the working local demonstration.

---

## 7. Development Guidelines

* **Linting & Formatting:** Prettier and ESLint must pass before any commits are pushed.
* **Git Commit Hygiene:** Commits must follow Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).
* **Testing:** Critical utilities (especially the hashing algorithm and the audit log hash-chain validator) must have 100% test coverage.

---

## 8. AI Principles

To ensure that the integration of artificial intelligence maintains investigative integrity, transparency, and ethical compliance, the following principles govern all AI capabilities in TRACE:
* **Advisory Role Only:** All AI outputs—including summaries, timeline reconstructions, and extracted entities—are strictly advisory. They are designed to assist human investigators, not replace human judgment.
* **Mandatory Explainability:** Every AI-suggested event or claim must be explainable. The system must display the underlying logic, heuristics, or prompt rationale to the user.
* **Evidence Referencing (Citations):** AI-generated text, timeline events, and case summaries must cite the specific source evidence (such as the evidence file ID or OCR text fragment) from which they were derived.
* **No Authenticity Claims:** The AI Processing Layer must not determine or certify the absolute truth or authenticity of any evidence file. Certifications are restricted to cryptographic integrity checks (SHA-256 matches) of the uploaded files.
* **No Legal Conclusions:** The system must not make legal conclusions, characterize actions as unlawful, or suggest legal charges or statutes.
* **No Guilt or Innocence Determination:** Under no circumstances shall the AI determine, infer, or output declarations regarding the guilt or innocence of any individual, organization, or suspect.
