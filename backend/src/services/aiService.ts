import Tesseract from "tesseract.js";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { pool } from "../db/index.js";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export class AIService {
  /**
   * Extract text from image files using Tesseract OCR
   */
  static async extractTextFromImage(filePath: string): Promise<string> {
    try {
      console.log(`Running Tesseract OCR on ${filePath}...`);
      const { data: { text } } = await Tesseract.recognize(filePath, "eng");
      return text.trim();
    } catch (error: any) {
      console.error("Tesseract OCR failed:", error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Extract key forensic entities using Gemini structured output
   */
  static async extractEntities(caseId: string, evidenceId: string | null, text: string): Promise<any> {
    if (!text.trim()) {
      return {
        names: [], phone_numbers: [], emails: [], urls: [],
        upi_ids: [], transaction_ids: [], dates: [], times: [], organizations: []
      };
    }

    if (!genAI) {
      console.warn("Gemini API key is not set. Returning empty entity extraction.");
      return {
        names: [], phone_numbers: [], emails: [], urls: [],
        upi_ids: [], transaction_ids: [], dates: [], times: [], organizations: []
      };
    }

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              names: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              phone_numbers: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              emails: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              urls: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              upi_ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              transaction_ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              dates: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              times: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
              organizations: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
            },
            required: [
              "names", "phone_numbers", "emails", "urls",
              "upi_ids", "transaction_ids", "dates", "times", "organizations"
            ]
          }
        }
      });

      const prompt = `Analyze the following forensic text extracted from case evidence. Extract all instances of:
- Names (people)
- Phone Numbers
- Emails
- URLs
- UPI IDs (Indian payment handles, e.g. user@okhdfcbank or 1234567890@paytm)
- Transaction IDs (payment/bank txn references)
- Dates (explicit dates)
- Times (explicit times)
- Organizations (companies, groups, institutions)

Ensure values are clean and accurately formatted.
Text:
"""
${text}
"""`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (error) {
      console.error("Gemini Entity Extraction failed:", error);
      throw error;
    }
  }

  /**
   * Generate vector embedding for semantic search
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    if (!genAI) {
      console.warn("Gemini API key is not set. Generating mock 768-dim embedding.");
      return Array(768).fill(0);
    }

    try {
      const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const result = await model.embedContent(text);
      if (result.embedding?.values) {
        return result.embedding.values;
      }
      throw new Error("Invalid embedding response from Gemini");
    } catch (error) {
      console.error("Gemini Embedding Generation failed:", error);
      throw error;
    }
  }

  /**
   * Save extracted OCR text to DB
   */
  static async saveOCRText(evidenceId: string, extractedText: string): Promise<void> {
    await pool.query("DELETE FROM evidence_ocr WHERE evidence_id = $1", [evidenceId]);
    await pool.query(
      "INSERT INTO evidence_ocr (evidence_id, extracted_text) VALUES ($1, $2)",
      [evidenceId, extractedText]
    );
  }

  /**
   * Save extracted entities to DB
   */
  static async saveEntities(caseId: string, evidenceId: string | null, entitiesObj: any): Promise<void> {
    if (evidenceId) {
      await pool.query("DELETE FROM extracted_entities WHERE evidence_id = $1", [evidenceId]);
    } else {
      await pool.query("DELETE FROM extracted_entities WHERE case_id = $1 AND evidence_id IS NULL", [caseId]);
    }

    const mapping = [
      { key: "names", type: "NAME" },
      { key: "phone_numbers", type: "PHONE" },
      { key: "emails", type: "EMAIL" },
      { key: "urls", type: "URL" },
      { key: "upi_ids", type: "UPI_ID" },
      { key: "transaction_ids", type: "TXN_ID" },
      { key: "dates", type: "DATE" },
      { key: "times", type: "TIME" },
      { key: "organizations", type: "ORGANIZATION" }
    ];

    for (const map of mapping) {
      const list = entitiesObj[map.key] || [];
      for (const val of list) {
        if (!val || typeof val !== "string" || !val.trim()) continue;
        await pool.query(
          `INSERT INTO extracted_entities (case_id, evidence_id, entity_type, entity_value)
           VALUES ($1, $2, $3, $4)`,
          [caseId, evidenceId, map.type, val.trim()]
        );
      }
    }
  }

  /**
   * Save raw content vector embedding to DB
   */
  static async saveEmbedding(
    caseId: string,
    evidenceId: string | null,
    contentType: "OCR_TEXT" | "TIMELINE_EVENT" | "CASE_SUMMARY",
    rawContent: string,
    embedding: number[]
  ): Promise<void> {
    if (evidenceId) {
      await pool.query(
        "DELETE FROM evidence_embeddings WHERE evidence_id = $1 AND content_type = $2",
        [evidenceId, contentType]
      );
    } else {
      await pool.query(
        "DELETE FROM evidence_embeddings WHERE case_id = $1 AND evidence_id IS NULL AND content_type = $2",
        [caseId, contentType]
      );
    }

    const vectorStr = `[${embedding.join(",")}]`;
    await pool.query(
      `INSERT INTO evidence_embeddings (case_id, evidence_id, content_type, raw_content, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [caseId, evidenceId, contentType, rawContent, vectorStr]
    );
  }

  /**
   * Generate Automated Case Timeline Events using Gemini
   */
  static async generateTimeline(caseId: string): Promise<any[]> {
    // 1. Fetch case details
    const caseRes = await pool.query("SELECT * FROM cases WHERE id = $1", [caseId]);
    if (caseRes.rows.length === 0) throw new Error("Case not found");
    const caseDetails = caseRes.rows[0];

    // 2. Fetch OCR text and metadata for all case evidence
    const evidenceRes = await pool.query(
      `SELECT e.id, e.original_filename, o.extracted_text
       FROM evidence e
       LEFT JOIN evidence_ocr o ON e.id = o.evidence_id
       WHERE e.case_id = $1`,
      [caseId]
    );

    const evidenceTexts = evidenceRes.rows.map(row => ({
      id: row.id,
      name: row.original_filename,
      text: row.extracted_text || ""
    }));

    // 3. Fetch custody logs
    const logsRes = await pool.query(
      "SELECT action_type, actor, details, created_at FROM custody_logs WHERE case_id = $1 ORDER BY created_at ASC",
      [caseId]
    );

    if (!genAI) {
      console.warn("Gemini API key is not set. Creating simple timeline based on custody logs.");
      // Fallback: create timeline events based on custody logs
      const fallbackEvents = [];
      for (const log of logsRes.rows) {
        fallbackEvents.push({
          description: log.details || `${log.action_type} by ${log.actor}`,
          event_timestamp: log.created_at,
          confidence: "HIGH",
          supporting_evidence_ids: []
        });
      }
      return fallbackEvents;
    }

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              events: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    description: { type: SchemaType.STRING },
                    event_timestamp: { type: SchemaType.STRING },
                    confidence: { type: SchemaType.STRING },
                    supporting_evidence_ids: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
                  },
                  required: ["description", "event_timestamp", "confidence", "supporting_evidence_ids"]
                }
              }
            },
            required: ["events"]
          }
        }
      });

      const prompt = `You are a forensic timeline analyzer. Given the case metadata, custody logs, and OCR texts extracted from evidence, construct a chronological timeline of the key investigation events and exfiltration activities mentioned *within* the evidence.

Case: ${caseDetails.title} - ${caseDetails.description}

Evidence List:
${JSON.stringify(evidenceTexts, null, 2)}

Custody Logs:
${JSON.stringify(logsRes.rows, null, 2)}

Instructions:
- Extract events, actions, chats, or transfers mentioned inside the files, emails, or logs.
- Map the event to the correct UTC timestamp in ISO 8601 format. If a year is missing, assume 2026.
- Assign confidence: HIGH (clear datetime stated), MEDIUM (rough date/time or message offset), or LOW (inferred time).
- List supporting evidence UUIDs in "supporting_evidence_ids" (must match one of the IDs in the Evidence List).

Return ONLY JSON array of events under "events" key.`;

      const result = await model.generateContent(prompt);
      const timelineObj = JSON.parse(result.response.text());
      return timelineObj.events || [];
    } catch (error) {
      console.error("Gemini Timeline Generation failed:", error);
      throw error;
    }
  }

  /**
   * Save Timeline Events to DB
   */
  static async saveTimelineEvents(caseId: string, events: any[]): Promise<void> {
    await pool.query("DELETE FROM investigation_timeline_events WHERE case_id = $1", [caseId]);

    for (const ev of events) {
      const supportingIds = ev.supporting_evidence_ids || [];
      // Clean and validate supporting IDs
      const cleanIds: string[] = [];
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const id of supportingIds) {
        if (uuidRegex.test(id)) cleanIds.push(id);
      }

      await pool.query(
        `INSERT INTO investigation_timeline_events (case_id, description, event_timestamp, confidence, supporting_evidence_ids)
         VALUES ($1, $2, $3, $4, $5)`,
        [caseId, ev.description, ev.event_timestamp, ev.confidence || "MEDIUM", cleanIds]
      );
    }
  }

  /**
   * Generate Structured Case Summary using Gemini
   */
  static async generateCaseSummary(caseId: string): Promise<any> {
    // 1. Fetch case details
    const caseRes = await pool.query("SELECT * FROM cases WHERE id = $1", [caseId]);
    if (caseRes.rows.length === 0) throw new Error("Case not found");
    const caseDetails = caseRes.rows[0];

    // 2. Fetch evidence list
    const evidenceRes = await pool.query(
      `SELECT e.id, e.original_filename, o.extracted_text
       FROM evidence e
       LEFT JOIN evidence_ocr o ON e.id = o.evidence_id
       WHERE e.case_id = $1`,
      [caseId]
    );

    const evidenceTexts = evidenceRes.rows.map(row => ({
      id: row.id,
      name: row.original_filename,
      text: row.extracted_text || ""
    }));

    // 3. Fetch timeline events
    const timelineRes = await pool.query(
      "SELECT description, event_timestamp, confidence FROM investigation_timeline_events WHERE case_id = $1 ORDER BY event_timestamp ASC",
      [caseId]
    );

    if (!genAI) {
      console.warn("Gemini API key is not set. Generating mock case summary.");
      return {
        executive_summary: `This is a mock summary for case "${caseDetails.title}" because the Gemini API Key is missing.`,
        key_events: timelineRes.rows.map(row => ({
          description: row.description,
          supporting_evidence: "Custody Logs"
        })),
        important_entities: []
      };
    }

    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              executive_summary: { type: SchemaType.STRING },
              key_events: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    description: { type: SchemaType.STRING },
                    supporting_evidence: { type: SchemaType.STRING }
                  },
                  required: ["description", "supporting_evidence"]
                }
              },
              important_entities: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    role_or_details: { type: SchemaType.STRING }
                  },
                  required: ["name", "role_or_details"]
                }
              }
            },
            required: ["executive_summary", "key_events", "important_entities"]
          }
        }
      });

      const prompt = `You are a lead digital forensics investigator compiling a final case analysis report.
Case Title: ${caseDetails.title}
Case Description: ${caseDetails.description}

Timeline Events Compiled:
${JSON.stringify(timelineRes.rows, null, 2)}

Evidence & Recovered Text:
${JSON.stringify(evidenceTexts, null, 2)}

Instructions:
- Write an "executive_summary" (2-3 paragraphs) detailing the timeline of exfiltration or events, suspects, and specific evidence found. Every key allegation must cite the evidence file name (e.g., "[quantum_source_code.zip]").
- List "key_events" with short descriptions and references to supporting evidence files.
- Highlight "important_entities" (e.g., suspect names, UPI IDs, exfiltrated files) with descriptions of their role.
- Be extremely accurate and strict. Cite actual evidence filenames. Avoid hallucinations.

Return ONLY JSON conforming to the schema.`;

      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (error) {
      console.error("Gemini Case Summarization failed:", error);
      throw error;
    }
  }

  /**
   * Save Case Summary to DB
   */
  static async saveCaseSummary(caseId: string, summaryObj: any): Promise<void> {
    await pool.query("DELETE FROM case_summaries WHERE case_id = $1", [caseId]);
    await pool.query(
      `INSERT INTO case_summaries (case_id, summary_content)
       VALUES ($1, $2)`,
      [caseId, JSON.stringify(summaryObj)]
    );
  }

  /**
   * Run Semantic Search using Cosine Distance
   */
  static async searchSemantic(caseId: string, query: string, limit: number = 5): Promise<any[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const res = await pool.query(
      `SELECT
         ee.evidence_id,
         ee.content_type,
         ee.raw_content,
         1 - (ee.embedding <=> $2::vector) AS similarity,
         e.original_filename
       FROM evidence_embeddings ee
       LEFT JOIN evidence e ON ee.evidence_id = e.id
       WHERE ee.case_id = $1
       ORDER BY ee.embedding <=> $2::vector
       LIMIT $3`,
      [caseId, `[${queryEmbedding.join(",")}]`, limit]
    );

    return res.rows.map(row => ({
      evidence_id: row.evidence_id,
      content_type: row.content_type,
      snippet: row.raw_content.length > 200 ? row.raw_content.substring(0, 200) + "..." : row.raw_content,
      similarity: parseFloat(row.similarity.toFixed(4)),
      filename: row.original_filename || "Case Summary / Timeline"
    }));
  }
}
