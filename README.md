# TRACE

> **Tamper-Resistant Record and Audit Chain for Evidence**

A chain-of-custody and evidence integrity platform designed to preserve, organize, verify, and track digital evidence throughout its lifecycle.

---

## Why TRACE?

Digital evidence is often fragmented across screenshots, emails, PDFs, videos, recordings, and chat exports.

Once evidence changes hands, proving that it remained unaltered becomes difficult.

TRACE addresses this problem by providing:

* Secure evidence collection
* SHA-256 integrity verification
* Chain-of-custody tracking
* Tamper-evident audit logs
* Timeline reconstruction
* Evidence bundle generation
* Verification reports

Rather than attempting to prove authenticity before collection, TRACE focuses on preserving **integrity after collection** and maintaining a transparent audit trail.

---

## The Problem

Investigators, organizations, compliance teams, and individuals frequently struggle to answer:

* Who collected this evidence?
* When was it collected?
* Has it been modified?
* Who accessed it?
* Can its integrity be verified?

Traditional storage systems answer none of these reliably.

TRACE was built to change that.

---

## Features

### Case Management

Create and organize investigation cases.

```text
Case
├── Evidence
├── Timeline
├── Audit Logs
└── Reports
```

### Evidence Upload

Upload:

* Images
* PDFs
* Videos
* Audio files
* Documents

### SHA-256 Hash Verification

Every uploaded file receives a cryptographic hash.

```text
Original File
      ↓
SHA-256 Hash
      ↓
Stored in Database
      ↓
Future Verification
```

### Chain of Custody

Track every evidence event:

* Upload
* Verification
* Transfer
* Export

### Evidence Timeline

Automatically reconstruct the sequence of events.

### PDF Reports

Generate investigation-ready reports.

### Evidence Bundle Export

Export complete evidence packages including:

```text
bundle.zip
├── evidence/
├── report.pdf
├── manifest.json
└── hashes.json
```

---

## Architecture

```text
┌────────────────────┐
│ React Frontend     │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Express API        │
└─────┬────────┬─────┘
      │        │
      ▼        ▼
┌─────────┐ ┌────────────┐
│Postgres │ │File Storage│
└────┬────┘ └─────┬──────┘
     │            │
     └────┬───────┘
          ▼
┌────────────────────┐
│ Verification Layer │
└────────────────────┘
```

---

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

### Backend

* Node.js
* Express
* TypeScript
* Multer
* pg

### Database

* PostgreSQL

### Security

* Node Crypto
* SHA-256 Hashing

### Reporting

* PDFKit

### Bundle Export

* Archiver

### Testing

* Vitest

---

## Project Structure

```text
TRACE/
├── frontend/
├── backend/
├── uploads/
├── reports/
├── specs/
│   └── 001-trace/
│       ├── spec.md
│       ├── plan.md
│       └── tasks.md
└── README.md
```

---

## MVP Scope

### Included

* Create Case
* Upload Evidence
* Generate SHA-256 Hash
* Store Metadata
* Log Custody Events
* Evidence Timeline
* Verify Integrity
* PDF Report Generation
* Evidence Bundle Export

### Future Roadmap

* Multi-user authentication
* Role-based access control
* Digital signatures
* Secure evidence sharing
* AI-assisted analysis
* Evidence confidence scoring
* Forensic integrations
* Court-ready workflows

---

## Demo Flow

1. Create a Case
2. Upload Evidence
3. Generate Hash
4. View Metadata
5. Log Custody Event
6. Verify Integrity
7. Generate PDF Report
8. Export Evidence Bundle

---

## Security Principles

TRACE is built around three core principles:

### Integrity

Evidence must remain unchanged after collection.

### Accountability

Every action must be logged.

### Transparency

Evidence history must be verifiable.

---

## Disclaimer

TRACE verifies evidence integrity after collection.

TRACE does not claim to prove evidence authenticity before collection.

---

## Team

**Solo Developer Project**

Built for Hackathon 2.

---

## License

MIT License
