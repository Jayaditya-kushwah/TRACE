import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./api.js";
import { pool } from "../db/index.js";
import { CustodyService } from "../services/custodyService.js";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

describe("API Routes & Path Traversal Security Tests", () => {
  let server: http.Server;
  let baseUrl: string;
  let testCaseId: string;

  beforeAll(async () => {
    // Clear test tables to keep tests clean and deterministic using admin pool
    const adminConnectionString = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL;
    const adminPool = new Pool({
      connectionString: adminConnectionString,
    });
    await adminPool.query("TRUNCATE custody_logs, evidence, cases CASCADE");
    await adminPool.end();

    // Setup a dummy case for testing uploads
    const testCase = await CustodyService.createCase(
      "REF-ROUTE-TEST",
      "Route Test Case",
      "Testing route security",
      "Investigator Alpha"
    );
    testCaseId = testCase.id;

    // Start Express app on dynamic port
    const app = express();
    app.use(express.json());
    app.use("/api", apiRouter);

    server = app.listen(0);
    const address = server.address();
    if (address && typeof address === "object") {
      baseUrl = `http://localhost:${address.port}/api`;
    } else {
      throw new Error("Could not start server on dynamic port");
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  });

  it("GET /cases retrieves the list of cases", async () => {
    const res = await fetch(`${baseUrl}/cases`);
    const json = await res.json() as any;
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeInstanceOf(Array);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /cases/:id/evidence rejects invalid UUID case IDs (path traversal defense)", async () => {
    const formData = new FormData();
    formData.append("uploaded_by", "Investigator Alpha");
    
    // Create a dummy blob/file
    const blob = new Blob(["test file content"], { type: "text/plain" });
    formData.append("file", blob, "test_file.txt");

    // Use a path-traversal style ID instead of a valid UUID
    const badId = "../../../etc/passwd";
    const res = await fetch(`${baseUrl}/cases/${encodeURIComponent(badId)}/evidence`, {
      method: "POST",
      body: formData,
    });

    const json = await res.json() as any;
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Invalid case ID format");
  });

  it("POST /cases/:id/evidence rejects filenames containing path traversal characters (path traversal defense)", async () => {
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="uploaded_by"\r\n\r\n`,
      `Investigator Alpha\r\n`,
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="foo..bar"\r\n`,
      `Content-Type: text/plain\r\n\r\n`,
      `secrets\r\n`,
      `--${boundary}--\r\n`
    ];
    const body = bodyParts.join("");

    const res = await fetch(`${baseUrl}/cases/${testCaseId}/evidence`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    const text = await res.text();
    if (res.status !== 400) {
      console.log("Response status:", res.status);
      console.log("Response text:", text);
    }
    const json = JSON.parse(text);
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toContain("Invalid file name structure");
  });
});
