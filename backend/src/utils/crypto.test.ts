import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { calculateFileHash, calculateLogHash } from "./crypto.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Crypto Utilities", () => {
  const testFilePath = path.join(__dirname, "test-hash-file.txt");

  beforeAll(() => {
    fs.writeFileSync(testFilePath, "TRACE Cryptographic Engine Test Content");
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it("calculates file hash matching sha256sum command", async () => {
    const jsHash = await calculateFileHash(testFilePath);
    const cmdOutput = execSync(`sha256sum "${testFilePath}"`).toString();
    const systemHash = cmdOutput.split(/\s+/)[0];
    expect(jsHash).toBe(systemHash);
  });

  it("calculates log hash consistently and correctly", () => {
    const log = {
      id: "d9b23b3a-58cc-48f1-9457-4b711e6cc462",
      case_id: "a9b23b3a-58cc-48f1-9457-4b711e6cc462",
      evidence_id: "b9b23b3a-58cc-48f1-9457-4b711e6cc462",
      action_type: "CASE_CREATED",
      actor: "System Admin",
      details: "Initial case creation",
      prev_log_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const hash1 = calculateLogHash(log);
    const hash2 = calculateLogHash(log);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
