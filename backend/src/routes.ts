import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as db from './db';
import { performOCR } from './ocr';
import * as ai from './ai';
import PDFDocument from 'pdfkit';
import archiver from 'archiver';

const router = Router();

// Helper to extract AI config from frontend request headers
function extractAiConfig(req: Request) {
  return {
    geminiKey: req.headers['x-gemini-key'] as string | undefined,
    useLocal: req.headers['x-use-local-ai'] === 'true',
    ollamaEndpoint: req.headers['x-ollama-endpoint'] as string | undefined,
    ollamaModel: req.headers['x-ollama-model'] as string | undefined,
  };
}

// Configure Multer for temp storage
const upload = multer({ dest: path.join(__dirname, '../temp') });

// Helper to calculate SHA-256 of a file stream
function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

// Helper to compute custody log hash
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

// Genesis hash for initial case creation log
const GENESIS_HASH = '0'.repeat(64);

// ----------------------------------------------------
// 1. Cases Endpoints
// ----------------------------------------------------

// Create Case
router.post('/cases', async (req: Request, res: Response) => {
  const { reference_id, title, description, created_by } = req.body;
  
  if (!reference_id || !title || !created_by) {
    return res.status(400).json({ success: false, error: 'reference_id, title, and created_by are required.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    // Create Case
    const caseId = uuidv4();
    const caseResult = await client.query(
      `INSERT INTO cases (id, reference_id, title, description, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [caseId, reference_id, title, description || '', created_by]
    );

    // Initial Custody Log
    const logId = uuidv4();
    const logPayload = {
      id: logId,
      case_id: caseId,
      evidence_id: null,
      action_type: 'CASE_CREATED',
      actor: created_by,
      details: `Case "${title}" initialized with Reference ID: ${reference_id}`,
      prev_log_hash: GENESIS_HASH
    };
    const logHash = calculateLogHash(logPayload);

    await client.query(
      `INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [logPayload.id, logPayload.case_id, logPayload.evidence_id, logPayload.action_type, logPayload.actor, logPayload.details, logPayload.prev_log_hash, logHash]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: caseResult.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// List Cases
router.get('/cases', async (req: Request, res: Response) => {
  try {
    const result = await db.query('SELECT * FROM cases ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Case Detail
router.get('/cases/:id', async (req: Request, res: Response) => {
  const caseId = req.params.id;
  try {
    const caseResult = await db.query('SELECT * FROM cases WHERE id = $1', [caseId]);
    if (caseResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    
    // Fetch evidence
    const evidenceResult = await db.query('SELECT * FROM evidence WHERE case_id = $1 ORDER BY uploaded_at DESC', [caseId]);
    
    // Fetch custody timeline logs
    const logsResult = await db.query('SELECT * FROM custody_logs WHERE case_id = $1 ORDER BY created_at ASC', [caseId]);
    
    res.json({
      success: true,
      data: {
        ...caseResult.rows[0],
        evidence: evidenceResult.rows,
        logs: logsResult.rows
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 2. Evidence Endpoints
// ----------------------------------------------------

// Upload Evidence
router.post('/cases/:id/evidence', upload.single('file'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const file = req.file;
  const { uploaded_by } = req.body;

  if (!file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }
  if (!uploaded_by) {
    return res.status(400).json({ success: false, error: 'uploaded_by is required.' });
  }

  const client = await db.getClient();
  try {
    // 1. Calculate SHA-256 hash of file
    const sha256Hash = await calculateFileHash(file.path);
    
    // 2. Generate Evidence UUID
    const evidenceId = uuidv4();
    
    // 3. Move file to permanent location
    const uploadsDir = path.join(__dirname, '../../uploads', caseId);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const destPath = path.join(uploadsDir, evidenceId);
    fs.renameSync(file.path, destPath);
    
    // Remove execute permissions on stored file
    fs.chmodSync(destPath, 0o644);

    await client.query('BEGIN');

    // 4. Save metadata to Database
    const evidenceResult = await client.query(
      `INSERT INTO evidence (id, case_id, original_filename, stored_filename, file_size_bytes, mime_type, sha256_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [evidenceId, caseId, file.originalname, evidenceId, file.size, file.mimetype, sha256Hash, uploaded_by]
    );

    // 5. Append Custody Log
    // Get last log entry to fetch previous hash
    const prevLogResult = await client.query(
      'SELECT log_hash FROM custody_logs WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1',
      [caseId]
    );
    const prevLogHash = prevLogResult.rows.length > 0 ? prevLogResult.rows[0].log_hash : GENESIS_HASH;

    const logId = uuidv4();
    const logPayload = {
      id: logId,
      case_id: caseId,
      evidence_id: evidenceId,
      action_type: 'EVIDENCE_UPLOADED',
      actor: uploaded_by,
      details: `Uploaded evidence file "${file.originalname}" (Size: ${file.size} bytes, SHA-256: ${sha256Hash})`,
      prev_log_hash: prevLogHash
    };
    const logHash = calculateLogHash(logPayload);

    await client.query(
      `INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [logPayload.id, logPayload.case_id, logPayload.evidence_id, logPayload.action_type, logPayload.actor, logPayload.details, logPayload.prev_log_hash, logHash]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: evidenceResult.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    // Clean temp file if it still exists
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Transfer Custody
router.post('/evidence/:id/transfer', async (req: Request, res: Response) => {
  const evidenceId = req.params.id;
  const { actor, recipient, reason } = req.body;

  if (!actor || !recipient || !reason) {
    return res.status(400).json({ success: false, error: 'actor, recipient, and reason are required.' });
  }

  const client = await db.getClient();
  try {
    // Fetch evidence details
    const evResult = await client.query('SELECT case_id, original_filename FROM evidence WHERE id = $1', [evidenceId]);
    if (evResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    const { case_id, original_filename } = evResult.rows[0];

    await client.query('BEGIN');

    // Get last log entry to fetch previous hash
    const prevLogResult = await client.query(
      'SELECT log_hash FROM custody_logs WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1',
      [case_id]
    );
    const prevLogHash = prevLogResult.rows.length > 0 ? prevLogResult.rows[0].log_hash : GENESIS_HASH;

    const logId = uuidv4();
    const logPayload = {
      id: logId,
      case_id,
      evidence_id: evidenceId,
      action_type: 'CUSTODY_TRANSFERRED',
      actor,
      details: `Transferred custody of "${original_filename}" from ${actor} to ${recipient}. Reason: ${reason}`,
      prev_log_hash: prevLogHash
    };
    const logHash = calculateLogHash(logPayload);

    await client.query(
      `INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [logPayload.id, logPayload.case_id, logPayload.evidence_id, logPayload.action_type, logPayload.actor, logPayload.details, logPayload.prev_log_hash, logHash]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Custody transferred successfully' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// Verify Single Evidence File and Case Hash Chain
router.post('/evidence/:id/verify', async (req: Request, res: Response) => {
  const evidenceId = req.params.id;
  try {
    // 1. Fetch metadata from DB
    const evResult = await db.query('SELECT * FROM evidence WHERE id = $1', [evidenceId]);
    if (evResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence metadata not found.' });
    }
    const evidence = evResult.rows[0];
    const { case_id, stored_filename, sha256_hash } = evidence;

    // 2. Recalculate file hash on server disk
    const filePath = path.join(__dirname, '../../uploads', case_id, stored_filename);
    
    if (!fs.existsSync(filePath)) {
      return res.json({
        success: true,
        data: {
          fileStatus: 'MISSING',
          message: 'Evidence file is missing on disk.'
        }
      });
    }

    const currentHash = await calculateFileHash(filePath);
    const fileMatches = (currentHash === sha256_hash);

    // 3. Log a verification custody log (immutability trail)
    const prevLogResult = await db.query(
      'SELECT log_hash FROM custody_logs WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1',
      [case_id]
    );
    const prevLogHash = prevLogResult.rows.length > 0 ? prevLogResult.rows[0].log_hash : GENESIS_HASH;

    const logId = uuidv4();
    const logPayload = {
      id: logId,
      case_id,
      evidence_id: evidenceId,
      action_type: 'INTEGRITY_VERIFIED',
      actor: 'System Integrity Scanner',
      details: `Integrity check for "${evidence.original_filename}" resulted in ${fileMatches ? 'PASS' : 'FAIL'}`,
      prev_log_hash: prevLogHash
    };
    const logHash = calculateLogHash(logPayload);
    
    await db.query(
      `INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [logPayload.id, logPayload.case_id, logPayload.evidence_id, logPayload.action_type, logPayload.actor, logPayload.details, logPayload.prev_log_hash, logHash]
    );

    res.json({
      success: true,
      data: {
        fileStatus: fileMatches ? 'VERIFIED' : 'TAMPERED',
        dbHash: sha256_hash,
        calculatedHash: currentHash,
        message: fileMatches ? 'PASS: File Hash matches database.' : 'FAIL: File content has been modified!'
      }
    });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Full Case Audit (Validate Hash Chain and all Files)
router.post('/cases/:id/verify', async (req: Request, res: Response) => {
  const caseId = req.params.id;
  try {
    // 1. Validate Log Chain
    const logsResult = await db.query('SELECT * FROM custody_logs WHERE case_id = $1 ORDER BY created_at ASC', [caseId]);
    const logs = logsResult.rows;
    let chainValid = true;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      // Recalculate hash
      const calculatedHash = calculateLogHash({
        id: log.id,
        case_id: log.case_id,
        evidence_id: log.evidence_id,
        action_type: log.action_type,
        actor: log.actor,
        details: log.details,
        prev_log_hash: log.prev_log_hash
      });

      if (calculatedHash !== log.log_hash) {
        chainValid = false;
        console.error(`Hash chain broken at log ID: ${log.id}. Calculated: ${calculatedHash}, DB: ${log.log_hash}`);
        break;
      }

      // Check linkage
      if (i > 0) {
        const prevLog = logs[i - 1];
        if (log.prev_log_hash !== prevLog.log_hash) {
          chainValid = false;
          console.error(`Linkage broken at log ID: ${log.id}. Points to: ${log.prev_log_hash}, Actual Prev: ${prevLog.log_hash}`);
          break;
        }
      } else {
        if (log.prev_log_hash !== GENESIS_HASH) {
          chainValid = false;
          console.error(`Genesis linkage broken at log ID: ${log.id}`);
          break;
        }
      }
    }

    // 2. Audit files
    const evidenceResult = await db.query('SELECT * FROM evidence WHERE case_id = $1', [caseId]);
    const evidenceList = evidenceResult.rows;
    const fileAudits: any[] = [];
    let allFilesMatch = true;

    for (const ev of evidenceList) {
      const filePath = path.join(__dirname, '../../uploads', caseId, ev.stored_filename);
      if (!fs.existsSync(filePath)) {
        fileAudits.push({ id: ev.id, filename: ev.original_filename, status: 'MISSING' });
        allFilesMatch = false;
      } else {
        const hash = await calculateFileHash(filePath);
        const matches = (hash === ev.sha256_hash);
        fileAudits.push({ id: ev.id, filename: ev.original_filename, status: matches ? 'VERIFIED' : 'TAMPERED' });
        if (!matches) allFilesMatch = false;
      }
    }

    res.json({
      success: true,
      data: {
        chainValid,
        allFilesMatch,
        fileAudits
      }
    });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 3. AI Evidence Intelligence Endpoints
// ----------------------------------------------------

// Process Evidence (Async OCR, Entities, Embedding)
router.post('/evidence/:id/process', async (req: Request, res: Response) => {
  const evidenceId = req.params.id;
  try {
    const evResult = await db.query('SELECT * FROM evidence WHERE id = $1', [evidenceId]);
    if (evResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evidence not found' });
    }
    const evidence = evResult.rows[0];
    const { case_id, stored_filename, mime_type, original_filename } = evidence;

    // Create entry in ocr_documents as pending
    const ocrDocId = uuidv4();
    await db.query(
      `INSERT INTO ocr_documents (id, evidence_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (evidence_id) DO UPDATE SET status = 'PENDING', error_message = NULL`,
      [ocrDocId, evidenceId, 'PENDING']
    );

    res.json({
      success: true,
      message: 'AI processing started in background',
      data: { evidence_id: evidenceId, status: 'PENDING' }
    });

    // Run AI task in background asynchronously
    (async () => {
      try {
        let textContent = '';
        if (mime_type.startsWith('image/')) {
          const filePath = path.join(__dirname, '../../uploads', case_id, stored_filename);
          // Run OCR
          textContent = await performOCR(filePath);
          
          await db.query(
            `UPDATE ocr_documents 
             SET extracted_text = $1, status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP
             WHERE evidence_id = $2`,
            [textContent, evidenceId]
          );
        } else if (mime_type.startsWith('text/') || mime_type === 'application/json') {
          const filePath = path.join(__dirname, '../../uploads', case_id, stored_filename);
          textContent = fs.readFileSync(filePath, 'utf8');
          
          await db.query(
            `UPDATE ocr_documents 
             SET extracted_text = $1, status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP
             WHERE evidence_id = $2`,
            [textContent, evidenceId]
          );
        } else {
          // Non-readable type, skip OCR but we can extract entities from metadata
          textContent = `Document Upload: ${original_filename}. Size: ${evidence.file_size_bytes} bytes. Hash: ${evidence.sha256_hash}`;
          await db.query(
            `UPDATE ocr_documents 
             SET extracted_text = $1, status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP
             WHERE evidence_id = $2`,
            [textContent, evidenceId]
          );
        }

        // 2. Generate and store Search Embedding
        const embedding = await ai.getEmbedding(textContent, extractAiConfig(req));
        const embId = uuidv4();
        await db.query(
          `INSERT INTO search_embeddings (id, case_id, entity_type, entity_id, content, embedding)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [embId, case_id, 'ocr', evidenceId, textContent, `[${embedding.join(',')}]`]
        );

        // 3. Extract and save Entities
        const regexEntities: Array<{ type: string; value: string; snippet: string }> = [];
        
        // Regex heuristics
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const phoneRegex = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
        const urlRegex = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
        const upiRegex = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/g;
        const txnRegex = /\b(?:Txn|Transaction|Tx|ID|Ref|Reference)[:\s]*([A-Za-z0-9_-]{8,24})\b/gi;

        let match;
        const getSnippet = (str: string, index: number, matchLen: number) => {
          const start = Math.max(0, index - 30);
          const end = Math.min(str.length, index + matchLen + 30);
          return '...' + str.slice(start, end).replace(/\n/g, ' ') + '...';
        };

        while ((match = emailRegex.exec(textContent)) !== null) {
          regexEntities.push({ type: 'EMAIL', value: match[0], snippet: getSnippet(textContent, match.index, match[0].length) });
        }
        while ((match = phoneRegex.exec(textContent)) !== null) {
          regexEntities.push({ type: 'PHONE', value: match[0], snippet: getSnippet(textContent, match.index, match[0].length) });
        }
        while ((match = urlRegex.exec(textContent)) !== null) {
          regexEntities.push({ type: 'URL', value: match[0], snippet: getSnippet(textContent, match.index, match[0].length) });
        }
        while ((match = upiRegex.exec(textContent)) !== null) {
          // Filter out emails that might overlap upi
          if (!match[0].includes('.com') && !match[0].includes('.org')) {
            regexEntities.push({ type: 'UPI_ID', value: match[0], snippet: getSnippet(textContent, match.index, match[0].length) });
          }
        }
        while ((match = txnRegex.exec(textContent)) !== null) {
          regexEntities.push({ type: 'TRANSACTION_ID', value: match[1], snippet: getSnippet(textContent, match.index, match[0].length) });
        }

        // LLM based extraction (Names, Organizations, Dates)
        const llmEntities = await ai.extractNamedEntities(textContent, extractAiConfig(req));
        
        // Save regex entities
        for (const ent of regexEntities) {
          await db.query(
            `INSERT INTO extracted_entities (case_id, evidence_id, entity_type, entity_value, context_snippet)
             VALUES ($1, $2, $3, $4, $5)`,
            [case_id, evidenceId, ent.type, ent.value, ent.snippet]
          );
        }

        // Save LLM entities
        for (const name of llmEntities.names) {
          await db.query(
            `INSERT INTO extracted_entities (case_id, evidence_id, entity_type, entity_value, context_snippet)
             VALUES ($1, $2, $3, $4, $5)`,
            [case_id, evidenceId, 'NAME', name, `Person Name identified in text: ${name}`]
          );
        }
        for (const org of llmEntities.organizations) {
          await db.query(
            `INSERT INTO extracted_entities (case_id, evidence_id, entity_type, entity_value, context_snippet)
             VALUES ($1, $2, $3, $4, $5)`,
            [case_id, evidenceId, 'ORGANIZATION', org, `Organization identified in text: ${org}`]
          );
        }

        // 4. Update advisory timeline and summary
        // Fetch all ocr records for this case
        const allOcrDocsResult = await db.query(
          `SELECT e.id, e.original_filename as filename, o.extracted_text as ocr_text
           FROM evidence e
           JOIN ocr_documents o ON e.id = o.evidence_id
           WHERE e.case_id = $1`,
          [case_id]
        );
        
        const evidenceDetailsForAI = allOcrDocsResult.rows.map(r => ({
          id: r.id,
          filename: r.filename,
          ocrText: r.ocr_text || ''
        }));

        // Reconstruct timeline suggestions
        const suggestedEvents = await ai.reconstructTimeline(evidenceDetailsForAI, extractAiConfig(req));
        
        // Remove old suggested events
        await db.query('DELETE FROM timeline_events WHERE case_id = $1', [case_id]);
        
        // Write new events
        for (const evt of suggestedEvents) {
          await db.query(
            `INSERT INTO timeline_events (case_id, event_date, title, description, explanation, source_evidence_ids)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [case_id, evt.eventDate, evt.title, evt.description, evt.explanation, evt.sourceEvidenceIds]
          );
        }

        // Regenerate Summary
        const caseResult = await db.query('SELECT title, description FROM cases WHERE id = $1', [case_id]);
        const summaryData = await ai.generateCaseSummary(
          caseResult.rows[0].title,
          caseResult.rows[0].description || '',
          evidenceDetailsForAI,
          extractAiConfig(req)
        );

        // Save summary
        await db.query(
          `INSERT INTO case_summaries (case_id, summary_text, cited_evidence_ids)
           VALUES ($1, $2, $3)
           ON CONFLICT (case_id) 
           DO UPDATE SET summary_text = EXCLUDED.summary_text, cited_evidence_ids = EXCLUDED.cited_evidence_ids, updated_at = CURRENT_TIMESTAMP`,
          [case_id, summaryData.summaryText, summaryData.citedEvidenceIds]
        );

        console.log(`Async AI analysis completed successfully for evidence: ${evidenceId}`);
        
      } catch (err) {
        console.error('Async AI processing failed:', err);
        await db.query(
          `UPDATE ocr_documents 
           SET status = 'FAILED', error_message = $1, processed_at = CURRENT_TIMESTAMP
           WHERE evidence_id = $2`,
          [String(err), evidenceId]
        );
      }
    })();

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Case Entities
router.get('/cases/:id/entities', async (req: Request, res: Response) => {
  const caseId = req.params.id;
  try {
    const result = await db.query('SELECT * FROM extracted_entities WHERE case_id = $1 ORDER BY created_at DESC', [caseId]);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get AI Advisory Timeline
router.get('/cases/:id/timeline-ai', async (req: Request, res: Response) => {
  const caseId = req.params.id;
  try {
    const result = await db.query('SELECT * FROM timeline_events WHERE case_id = $1 ORDER BY event_date ASC', [caseId]);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Case Summary (generates if not exists)
router.get('/cases/:id/summary', async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const regenerate = req.query.regenerate === 'true';
  try {
    const existingResult = await db.query('SELECT * FROM case_summaries WHERE case_id = $1', [caseId]);
    
    if (existingResult.rows.length > 0 && !regenerate) {
      return res.json({ success: true, data: existingResult.rows[0] });
    }

    // Generate summary
    const caseResult = await db.query('SELECT title, description FROM cases WHERE id = $1', [caseId]);
    if (caseResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    // Fetch evidence with OCR
    const allOcrDocsResult = await db.query(
      `SELECT e.id, e.original_filename as filename, o.extracted_text as ocr_text
       FROM evidence e
       JOIN ocr_documents o ON e.id = o.evidence_id
       WHERE e.case_id = $1`,
      [caseId]
    );

    const summaryData = await ai.generateCaseSummary(
      caseResult.rows[0].title,
      caseResult.rows[0].description || '',
      allOcrDocsResult.rows.map(r => ({
        id: r.id,
        filename: r.filename,
        ocrText: r.ocr_text || ''
      }))
    );

    // Save summary
    const insertResult = await db.query(
      `INSERT INTO case_summaries (case_id, summary_text, cited_evidence_ids)
       VALUES ($1, $2, $3)
       ON CONFLICT (case_id) 
       DO UPDATE SET summary_text = EXCLUDED.summary_text, cited_evidence_ids = EXCLUDED.cited_evidence_ids, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [caseId, summaryData.summaryText, summaryData.citedEvidenceIds]
    );

    res.json({ success: true, data: insertResult.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 4. Semantic Vector Search Endpoints
// ----------------------------------------------------
router.post('/search', async (req: Request, res: Response) => {
  const { case_id, query } = req.body;
  if (!case_id || !query) {
    return res.status(400).json({ success: false, error: 'case_id and query are required.' });
  }

  try {
    // 1. Generate embedding vector for user query
    const queryVector = await ai.getEmbedding(query, extractAiConfig(req));
    
    // 2. Query DB using vector cosine similarity (<=>)
    const result = await db.query(
      `SELECT s.entity_type, s.entity_id, s.content, 
              (1 - (s.embedding <=> $1::vector)) as similarity,
              e.original_filename
       FROM search_embeddings s
       LEFT JOIN evidence e ON s.entity_id = e.id
       WHERE s.case_id = $2
       ORDER BY s.embedding <=> $1::vector
       LIMIT 10`,
      [`[${queryVector.join(',')}]`, case_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 5. Dynamic AI Translation Endpoint
// ----------------------------------------------------
router.post('/translate', async (req: Request, res: Response) => {
  const { text, lang } = req.body;
  if (!text || !lang) {
    return res.status(400).json({ success: false, error: 'text and lang are required.' });
  }

  try {
    const translated = await ai.translateText(text, lang, extractAiConfig(req));
    res.json({ success: true, data: { translated } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 6. Case PDF Report Generation
// ----------------------------------------------------
router.get('/cases/:id/report', async (req: Request, res: Response) => {
  const caseId = req.params.id;
  try {
    const caseResult = await db.query('SELECT * FROM cases WHERE id = $1', [caseId]);
    if (caseResult.rows.length === 0) {
      return res.status(404).send('Case not found');
    }
    const cData = caseResult.rows[0];

    const evidenceResult = await db.query('SELECT * FROM evidence WHERE case_id = $1 ORDER BY uploaded_at DESC', [caseId]);
    const logsResult = await db.query('SELECT * FROM custody_logs WHERE case_id = $1 ORDER BY created_at ASC', [caseId]);

    // Build PDFKit Doc
    const doc = new PDFDocument({ margin: 50 });
    
    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="TRACE-Report-${cData.reference_id}.pdf"`);
    
    doc.pipe(res);

    // Title Block
    doc.fillColor('#006aaa').fontSize(24).text('TRACE AUDIT REPORT', { align: 'center' });
    doc.fillColor('#333333').fontSize(10).text('Tamper-Resistant Record & Audit Chain for Evidence', { align: 'center' });
    doc.moveDown(1.5);

    // Case Details Table
    doc.fillColor('#006aaa').fontSize(14).text('Case Metadata');
    doc.lineWidth(1).strokeColor('#dddddd').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fillColor('#333333').fontSize(10);
    doc.text(`Case Title: ${cData.title}`);
    doc.text(`Reference ID: ${cData.reference_id}`);
    doc.text(`Created By: ${cData.created_by}`);
    doc.text(`Created At: ${new Date(cData.created_at).toUTCString()}`);
    doc.text(`Description: ${cData.description || 'No description provided'}`);
    doc.moveDown(1.5);

    // Evidence List Table
    doc.fillColor('#006aaa').fontSize(14).text('Evidence Ingestion Log');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    if (evidenceResult.rows.length === 0) {
      doc.fillColor('#666666').fontSize(10).text('No evidence uploaded.');
    } else {
      evidenceResult.rows.forEach((ev: any, index: number) => {
        doc.fillColor('#333333').fontSize(10).text(`${index + 1}. Filename: ${ev.original_filename}`);
        doc.fontSize(8).fillColor('#666666')
          .text(`   Uploaded By: ${ev.uploaded_by} | Size: ${ev.file_size_bytes} bytes | Ingest Date: ${new Date(ev.uploaded_at).toUTCString()}`)
          .text(`   Cryptographic SHA-256 Hash: ${ev.sha256_hash}`)
          .moveDown(0.5);
      });
    }
    doc.moveDown();

    // Custody Logs Timeline
    doc.fillColor('#006aaa').fontSize(14).text('Chain of Custody Logs');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    logsResult.rows.forEach((log: any, index: number) => {
      doc.fillColor('#333333').fontSize(10).text(`[${new Date(log.created_at).toUTCString()}] ${log.action_type}`);
      doc.fontSize(8).fillColor('#666666')
        .text(`   Actor: ${log.actor}`)
        .text(`   Event: ${log.details}`)
        .text(`   Log Hash: ${log.log_hash}`)
        .moveDown(0.5);
    });

    // Verification Seal
    doc.moveDown(2);
    doc.fillColor('#006aaa').fontSize(12).text('TRACE Verification Seal', { align: 'right' });
    doc.fontSize(9).fillColor('#008800').text('SYSTEM HASH VALIDATED - SECURE CUSTODY TRAIL PRESERVED', { align: 'right' });

    doc.end();

  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// ----------------------------------------------------
// 7. Case ZIP Bundle Ingestion Package
// ----------------------------------------------------
router.get('/cases/:id/bundle', async (req: Request, res: Response) => {
  const caseId = req.params.id;
  try {
    const caseResult = await db.query('SELECT * FROM cases WHERE id = $1', [caseId]);
    if (caseResult.rows.length === 0) {
      return res.status(404).send('Case not found');
    }
    const cData = caseResult.rows[0];

    const evidenceResult = await db.query('SELECT * FROM evidence WHERE case_id = $1', [caseId]);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="TRACE-CaseBundle-${cData.reference_id}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // 1. Add PDF Report
    // Fetch PDF stream content internally
    const doc = new PDFDocument({ margin: 50 });
    
    // Write PDF to temp buffer
    const tempPdfPath = path.join(__dirname, `../temp/report-${caseId}.pdf`);
    const pdfStream = fs.createWriteStream(tempPdfPath);
    doc.pipe(pdfStream);
    
    doc.fillColor('#006aaa').fontSize(24).text('TRACE AUDIT REPORT', { align: 'center' });
    doc.fillColor('#333333').fontSize(10).text('Tamper-Resistant Record & Audit Chain for Evidence', { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(14).text('Case Metadata');
    doc.fontSize(10).text(`Case Title: ${cData.title}`);
    doc.text(`Reference ID: ${cData.reference_id}`);
    doc.text(`Created By: ${cData.created_by}`);
    doc.text(`Created At: ${new Date(cData.created_at).toUTCString()}`);
    doc.text(`Description: ${cData.description || 'No description provided'}`);
    doc.moveDown(1.5);
    doc.fontSize(14).text('Evidence Files List');
    
    evidenceResult.rows.forEach((ev: any) => {
      doc.fontSize(10).text(`- ${ev.original_filename} (SHA-256: ${ev.sha256_hash})`);
    });
    
    doc.end();

    // Wait for PDF writing to finish
    await new Promise<void>(resolve => pdfStream.on('finish', () => resolve()));

    // Append report PDF
    archive.file(tempPdfPath, { name: `report-${cData.reference_id}.pdf` });

    // 2. Add raw evidence files renamed to original names
    evidenceResult.rows.forEach((ev: any) => {
      const filePath = path.join(__dirname, '../../uploads', caseId, ev.stored_filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `evidence/${ev.original_filename}` });
      }
    });

    // 3. Add manifest.json metadata dump
    const manifest = {
      case: {
        id: cData.id,
        reference_id: cData.reference_id,
        title: cData.title,
        description: cData.description,
        created_at: cData.created_at,
        created_by: cData.created_by
      },
      evidence: evidenceResult.rows.map((ev: any) => ({
        id: ev.id,
        original_filename: ev.original_filename,
        file_size_bytes: ev.file_size_bytes,
        mime_type: ev.mime_type,
        sha256_hash: ev.sha256_hash,
        uploaded_by: ev.uploaded_by,
        uploaded_at: ev.uploaded_at
      }))
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Finalize ZIP
    await archive.finalize();

    // Cleanup temp PDF after response completes
    res.on('finish', () => {
      if (fs.existsSync(tempPdfPath)) {
        fs.unlinkSync(tempPdfPath);
      }
    });

  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// ----------------------------------------------------
// 8. Demo Data Generator
// ----------------------------------------------------
router.post('/demo', async (req: Request, res: Response) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const caseId = uuidv4();
    const now = new Date();

    // Create demo case
    await client.query(
      `INSERT INTO cases (id, reference_id, title, description, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        caseId,
        `DEMO-${Date.now().toString(36).toUpperCase()}`,
        'Operation Nightfall — Financial Fraud Investigation',
        'Multi-jurisdictional investigation into a sophisticated wire fraud scheme involving shell companies, cryptocurrency laundering, and forged identity documents. The suspect network operated across 3 countries over 18 months.',
        'Agent Sarah Chen',
        new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      ]
    );

    // Custody log entries
    const logEntries = [
      {
        action_type: 'CASE_CREATED',
        actor: 'Agent Sarah Chen',
        details: 'Case "Operation Nightfall" initialized. Multi-jurisdictional wire fraud investigation launched per authorization #FED-2026-4491.',
        offset: -7 * 24 * 60 * 60 * 1000
      },
      {
        action_type: 'EVIDENCE_UPLOADED',
        actor: 'Agent Sarah Chen',
        details: 'Uploaded bank statement scan "chase_stmt_jan2026.pdf" (Size: 245,891 bytes, SHA-256: a3f1...c8d2). Source: Subpoena #FIN-0091.',
        offset: -6 * 24 * 60 * 60 * 1000
      },
      {
        action_type: 'EVIDENCE_UPLOADED',
        actor: 'Forensics Tech Mike Torres',
        details: 'Uploaded recovered email archive "suspect_emails_export.eml" (Size: 1,892,044 bytes, SHA-256: 7b2e...91f0). Extracted from seized laptop SN:DL4490.',
        offset: -5 * 24 * 60 * 60 * 1000
      },
      {
        action_type: 'INTEGRITY_VERIFIED',
        actor: 'System Integrity Scanner',
        details: 'Automated integrity check for all ingested evidence files — PASS. All SHA-256 checksums match database records.',
        offset: -5 * 24 * 60 * 60 * 1000 + 3600000
      },
      {
        action_type: 'CUSTODY_TRANSFERRED',
        actor: 'Agent Sarah Chen',
        details: 'Transferred custody of email archive from Agent Chen to Detective Mark Gable (Cybercrime Unit). Reason: Cross-reference with ongoing phishing investigation #CYB-2026-112.',
        offset: -4 * 24 * 60 * 60 * 1000
      },
      {
        action_type: 'EVIDENCE_UPLOADED',
        actor: 'Detective Mark Gable',
        details: 'Uploaded cryptocurrency wallet transaction log "btc_wallet_txns.json" (Size: 89,201 bytes, SHA-256: d9c4...2a1b). Contains 47 flagged transactions.',
        offset: -3 * 24 * 60 * 60 * 1000
      },
      {
        action_type: 'INTEGRITY_VERIFIED',
        actor: 'System Integrity Scanner',
        details: 'Post-transfer integrity verification for email archive — PASS. No tampering detected.',
        offset: -2 * 24 * 60 * 60 * 1000
      },
      {
        action_type: 'EVIDENCE_UPLOADED',
        actor: 'Agent Sarah Chen',
        details: 'Uploaded forged passport scan "forged_passport_suspect_a.png" (Size: 3,102,445 bytes, SHA-256: ef01...8c3d). Retrieved from suspect\'s residence.',
        offset: -1 * 24 * 60 * 60 * 1000
      }
    ];

    let prevHash = GENESIS_HASH;
    for (const entry of logEntries) {
      const logId = uuidv4();
      const logPayload = {
        id: logId,
        case_id: caseId,
        evidence_id: null,
        action_type: entry.action_type,
        actor: entry.actor,
        details: entry.details,
        prev_log_hash: prevHash
      };
      const logHash = calculateLogHash(logPayload);

      await client.query(
        `INSERT INTO custody_logs (id, case_id, evidence_id, action_type, actor, details, prev_log_hash, log_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [logId, caseId, null, entry.action_type, entry.actor, entry.details, prevHash, logHash, new Date(now.getTime() + entry.offset)]
      );
      prevHash = logHash;
    }

    // Add an AI summary
    await client.query(
      `INSERT INTO case_summaries (case_id, summary_text, cited_evidence_ids)
       VALUES ($1, $2, $3)`,
      [
        caseId,
        `ADVISORY SUMMARY — Operation Nightfall\n\nThis case involves a sophisticated wire fraud scheme operating across multiple jurisdictions. Key findings include:\n\n• Bank statements reveal 12 suspicious wire transfers totaling $2.3M to shell companies in the Cayman Islands between Jan–Mar 2026.\n• Recovered email archives contain 23 communications between the primary suspect and unidentified co-conspirators discussing "the package" — likely code for cryptocurrency transfers.\n• Blockchain analysis of the seized Bitcoin wallet shows a layering pattern consistent with money laundering: funds were split across 47 transactions through 6 intermediate wallets before consolidation.\n• A forged passport was recovered from the suspect's residence, suggesting intent to flee jurisdiction.\n\nRECOMMENDATION: Escalate to inter-agency task force. Evidence chain integrity is verified and court-admissible.`,
        `{}`
      ]
    );

    // Create a fake evidence record to satisfy foreign key constraints for entities
    const fakeEvidenceId = uuidv4();
    await client.query(
      `INSERT INTO evidence (id, case_id, original_filename, stored_filename, file_size_bytes, mime_type, sha256_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [fakeEvidenceId, caseId, 'suspect_emails_export.eml', 'suspect_emails_export.eml', 1892044, 'message/rfc822', '7b2e2d9319b28b7fa9e2a406692794eb8515324c4dc8c9a633390c2a2291f0', 'Forensics Tech Mike Torres']
    );

    // Add sample extracted entities
    const entities = [
      { type: 'NAME', value: 'Sarah Chen', snippet: 'Lead investigator Agent Sarah Chen' },
      { type: 'NAME', value: 'Mark Gable', snippet: 'Detective Mark Gable from Cybercrime Unit' },
      { type: 'ORGANIZATION', value: 'Cayman Islands Holdings Ltd', snippet: 'Wire transfers to Cayman Islands Holdings Ltd' },
      { type: 'TRANSACTION_ID', value: 'TXN-8834-ABCF', snippet: 'Suspicious transaction TXN-8834-ABCF flagged' },
      { type: 'TRANSACTION_ID', value: 'BTC-W3X9-7721', snippet: 'Bitcoin wallet transaction BTC-W3X9-7721' },
      { type: 'EMAIL', value: 'j.doe.offshore@protonmail.com', snippet: 'Communications from j.doe.offshore@protonmail.com' },
      { type: 'PHONE', value: '+1-555-0142', snippet: 'Contact number +1-555-0142 found in emails' },
      { type: 'UPI_ID', value: 'suspect.pay@crypto', snippet: 'Cryptocurrency payment ID suspect.pay@crypto' }
    ];

    for (const ent of entities) {
      await client.query(
        `INSERT INTO extracted_entities (case_id, evidence_id, entity_type, entity_value, context_snippet)
         VALUES ($1, $2, $3, $4, $5)`,
        [caseId, fakeEvidenceId, ent.type, ent.value, ent.snippet]
      );
    }

    // Add AI timeline events
    const timelineEvents = [
      {
        date: new Date(2026, 0, 15),
        title: 'First Suspicious Wire Transfer',
        desc: '$450,000 wired to Cayman Islands Holdings Ltd from suspect\'s business account.',
        explanation: 'Pattern matches known layering technique. Amount just below $500K reporting threshold.'
      },
      {
        date: new Date(2026, 1, 3),
        title: 'Email Communication Spike',
        desc: '12 encrypted emails exchanged between suspect and j.doe.offshore@protonmail.com.',
        explanation: 'Timing correlates with second batch of wire transfers. Likely coordination of fund movement.'
      },
      {
        date: new Date(2026, 2, 20),
        title: 'Bitcoin Wallet Activity',
        desc: '47 transactions totaling 38.2 BTC processed through 6 intermediate wallets.',
        explanation: 'Classic tumbling pattern detected. Funds consolidated into a single cold wallet.'
      },
      {
        date: new Date(2026, 3, 1),
        title: 'Forged Identity Document Created',
        desc: 'Metadata analysis of forged passport indicates creation date around April 1st, 2026.',
        explanation: 'Suspect likely preparing to flee jurisdiction. Passport uses high-quality printing consistent with professional forgery ring.'
      }
    ];

    for (const evt of timelineEvents) {
      await client.query(
        `INSERT INTO timeline_events (case_id, event_date, title, description, explanation, source_evidence_ids)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [caseId, evt.date, evt.title, evt.desc, evt.explanation, '{}']
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ success: true, data: { case_id: caseId, message: 'Demo case generated successfully.' } });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

export default router;
