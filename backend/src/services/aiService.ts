import Tesseract from "tesseract.js";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { pool } from "../db/index.js";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Get Gemini API client, using custom key if provided, else system default.
 */
function getGenAIClient(aiConfig?: any) {
  if (aiConfig?.provider === "gemini" && aiConfig?.apiKey) {
    return new GoogleGenerativeAI(aiConfig.apiKey);
  }
  return genAI;
}

/**
 * Clean markdown tags (e.g. ```json ... ```) and parse valid JSON.
 */
function cleanAndParseJSON(text: string): any {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  }
  
  // Extract JSON structure if extra text surrounds it
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else {
    const firstBracket = cleaned.indexOf("[");
    const lastBracket = cleaned.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }
  }
  
  return JSON.parse(cleaned);
}

/**
 * Self-healing vector adapter.
 * Pads smaller vectors with zeros and truncates larger vectors to exactly targetDim (768).
 */
function adjustEmbeddingDimension(embedding: number[], targetDim = 768): number[] {
  if (!Array.isArray(embedding)) {
    console.warn("Embedding is not an array. Returning mock vector.");
    return Array(targetDim).fill(0);
  }
  if (embedding.length === targetDim) {
    return embedding;
  }
  if (embedding.length < targetDim) {
    console.log(`Padding embedding vector from ${embedding.length} to ${targetDim} dimensions.`);
    return [...embedding, ...Array(targetDim - embedding.length).fill(0)];
  }
  console.log(`Truncating embedding vector from ${embedding.length} to ${targetDim} dimensions.`);
  return embedding.slice(0, targetDim);
}

/**
 * Make a chat/completion call to Ollama.
 */
async function callOllamaChat(
  endpoint: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const url = `${endpoint.replace(/\/$/, "")}/api/chat`;
  console.log(`Calling Ollama Chat API at ${url} with model ${model}...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        options: {
          temperature: 0.1
        },
        format: "json",
        stream: false
      })
    });
    if (!res.ok) {
      throw new Error(`Ollama Chat request failed: ${res.statusText} (${res.status})`);
    }
    const data: any = await res.json();
    return data.message?.content || "";
  } catch (err: any) {
    console.error("Error communicating with Ollama chat API:", err);
    throw new Error(`Ollama Chat Error: ${err.message}. Ensure Ollama is running at ${endpoint} and model ${model} is pulled.`);
  }
}

/**
 * Make an embedding call to Ollama.
 */
async function callOllamaEmbeddings(
  endpoint: string,
  model: string,
  prompt: string
): Promise<number[]> {
  const url = `${endpoint.replace(/\/$/, "")}/api/embeddings`;
  console.log(`Calling Ollama Embeddings API at ${url} with model ${model}...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt
      })
    });
    if (!res.ok) {
      throw new Error(`Ollama Embeddings request failed: ${res.statusText} (${res.status})`);
    }
    const data: any = await res.json();
    return data.embedding || [];
  } catch (err: any) {
    console.error("Error communicating with Ollama embedding API:", err);
    throw new Error(`Ollama Embedding Error: ${err.message}. Ensure Ollama is running at ${endpoint} and model ${model} is pulled.`);
  }
}

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
   * Extract key forensic entities using Gemini structured output or Ollama chat
   */
  static async extractEntities(caseId: string, evidenceId: string | null, text: string, aiConfig?: any): Promise<any> {
    if (!text.trim()) {
      return {
        names: [], phone_numbers: [], emails: [], urls: [],
        upi_ids: [], transaction_ids: [], dates: [], times: [], organizations: []
      };
    }

    const provider = aiConfig?.provider || "gemini";
    const modelName = aiConfig?.model || "gemini-2.5-flash";

    const systemPrompt = `You are a forensic entity extractor. You must return valid JSON containing entities extracted from forensic text.
Do not write markdown, do not write extra text. Your output must strictly match this JSON schema:
{
  "names": ["string"],
  "phone_numbers": ["string"],
  "emails": ["string"],
  "urls": ["string"],
  "upi_ids": ["string"],
  "transaction_ids": ["string"],
  "dates": ["string"],
  "times": ["string"],
  "organizations": ["string"]
}`;

    const userPrompt = `Analyze the following forensic text extracted from case evidence. Extract all instances of:
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

    // Local Ollama Inference
    if (provider === "ollama") {
      try {
        const rawResponse = await callOllamaChat(
          aiConfig?.endpoint || "http://localhost:11434",
          modelName || "llama3",
          systemPrompt,
          userPrompt
        );
        return cleanAndParseJSON(rawResponse);
      } catch (err: any) {
        console.warn("Ollama extraction failed, returning empty entities:", err.message);
        return {
          names: [], phone_numbers: [], emails: [], urls: [],
          upi_ids: [], transaction_ids: [], dates: [], times: [], organizations: []
        };
      }
    }

    // Gemini Cloud / BYOK
    const activeGenAI = getGenAIClient(aiConfig);
    if (!activeGenAI) {
      console.warn("Gemini client is not initialized. Returning empty entities.");
      return {
        names: [], phone_numbers: [], emails: [], urls: [],
        upi_ids: [], transaction_ids: [], dates: [], times: [], organizations: []
      };
    }

    try {
      const model = activeGenAI.getGenerativeModel({
        model: modelName,
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
  static async generateEmbedding(text: string, aiConfig?: any): Promise<number[]> {
    const provider = aiConfig?.provider || "gemini";
    const embeddingModel = aiConfig?.embeddingModel || "text-embedding-004";

    if (provider === "ollama") {
      try {
        const rawVector = await callOllamaEmbeddings(
          aiConfig?.endpoint || "http://localhost:11434",
          embeddingModel || "nomic-embed-text",
          text
        );
        return adjustEmbeddingDimension(rawVector, 768);
      } catch (err: any) {
        console.warn("Ollama embedding extraction failed. Generating mock 768-dim embedding:", err.message);
        return Array(768).fill(0);
      }
    }

    // Gemini
    const activeGenAI = getGenAIClient(aiConfig);
    if (!activeGenAI) {
      console.warn("Gemini client is not initialized. Generating mock 768-dim embedding.");
      return Array(768).fill(0);
    }

    try {
      const model = activeGenAI.getGenerativeModel({ model: embeddingModel });
      const result = await model.embedContent(text);
      if (result.embedding?.values) {
        return adjustEmbeddingDimension(result.embedding.values, 768);
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
   * Generate Automated Case Timeline Events using Gemini or local Ollama
   */
  static async generateTimeline(caseId: string, aiConfig?: any): Promise<any[]> {
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

    const provider = aiConfig?.provider || "gemini";
    const modelName = aiConfig?.model || "gemini-2.5-flash";

    const systemPrompt = `You are a forensic timeline analyzer. You must output a JSON object containing a chronological timeline of key events found inside case files and custody logs.
Your output must strictly be a JSON object matching this schema:
{
  "events": [
    {
      "description": "string",
      "event_timestamp": "string (ISO 8601, e.g. 2026-06-12T13:22:53Z)",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "supporting_evidence_ids": ["string (UUIDs matching evidence list)"]
    }
  ]
}`;

    const userPrompt = `Construct a chronological timeline of the key investigation events and activities mentioned within the evidence or logs.
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

Return only the JSON output containing "events".`;

    if (provider === "ollama") {
      try {
        const rawResponse = await callOllamaChat(
          aiConfig?.endpoint || "http://localhost:11434",
          modelName || "llama3",
          systemPrompt,
          userPrompt
        );
        const parsed = cleanAndParseJSON(rawResponse);
        return parsed.events || [];
      } catch (err: any) {
        console.warn("Ollama timeline generation failed, returning fallback timeline:", err.message);
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
    }

    // Gemini
    const activeGenAI = getGenAIClient(aiConfig);
    if (!activeGenAI) {
      console.warn("Gemini client is not initialized. Creating simple timeline based on custody logs.");
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
      const model = activeGenAI.getGenerativeModel({
        model: modelName,
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

      const result = await model.generateContent(userPrompt);
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
   * Generate Structured Case Summary using Gemini or local Ollama
   */
  static async generateCaseSummary(caseId: string, aiConfig?: any): Promise<any> {
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

    const provider = aiConfig?.provider || "gemini";
    const modelName = aiConfig?.model || "gemini-2.5-flash";

    const systemPrompt = `You are a lead digital forensics investigator compiling a final case analysis report.
Output must strictly be a JSON object matching this schema:
{
  "executive_summary": "string (2-3 paragraphs detailing activities and suspects, cite evidence filenames)",
  "key_events": [
    {
      "description": "string",
      "supporting_evidence": "string (evidence filename)"
    }
  ],
  "important_entities": [
    {
      "name": "string",
      "role_or_details": "string"
    }
  ]
}`;

    const userPrompt = `Lead investigator case analysis report compile instructions:
Case Title: ${caseDetails.title}
Case Description: ${caseDetails.description}

Timeline Events Compiled:
${JSON.stringify(timelineRes.rows, null, 2)}

Evidence & Recovered Text:
${JSON.stringify(evidenceTexts, null, 2)}

Instructions:
- Write an "executive_summary" detailing findings. Cite actual evidence filenames like "[quantum_source_code.zip]".
- List "key_events" referencing supporting evidence.
- Highlight "important_entities" (e.g. suspect names, UPI IDs) with description of role.

Return only JSON.`;

    if (provider === "ollama") {
      try {
        const rawResponse = await callOllamaChat(
          aiConfig?.endpoint || "http://localhost:11434",
          modelName || "llama3",
          systemPrompt,
          userPrompt
        );
        return cleanAndParseJSON(rawResponse);
      } catch (err: any) {
        console.warn("Ollama case summary failed, returning fallback mock summary:", err.message);
        return {
          executive_summary: `Case summary for case "${caseDetails.title}". System was unable to process with Ollama.`,
          key_events: timelineRes.rows.map(row => ({
            description: row.description,
            supporting_evidence: "Custody Logs"
          })),
          important_entities: []
        };
      }
    }

    // Gemini
    const activeGenAI = getGenAIClient(aiConfig);
    if (!activeGenAI) {
      console.warn("Gemini client is not initialized. Generating mock case summary.");
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
      const model = activeGenAI.getGenerativeModel({
        model: modelName,
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

      const result = await model.generateContent(userPrompt);
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
  static async searchSemantic(caseId: string, query: string, limit: number = 5, aiConfig?: any): Promise<any[]> {
    const queryEmbedding = await this.generateEmbedding(query, aiConfig);

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
