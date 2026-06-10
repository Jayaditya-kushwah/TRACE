import crypto from "crypto";
import fs from "fs";

/**
 * Calculates the SHA-256 hash of a file on disk using a read stream.
 */
export function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });

    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });

    stream.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Calculates the SHA-256 hash of a custody log record to maintain the linked chain.
 * Formula: SHA256(id + case_id + (evidence_id || "") + action_type + actor + (details || "") + prev_log_hash)
 */
export function calculateLogHash(log: {
  id: string;
  case_id: string;
  evidence_id: string | null;
  action_type: string;
  actor: string;
  details: string | null;
  prev_log_hash: string;
}): string {
  const dataString =
    log.id +
    log.case_id +
    (log.evidence_id || "") +
    log.action_type +
    log.actor +
    (log.details || "") +
    log.prev_log_hash;

  return crypto.createHash("sha256").update(dataString).digest("hex");
}
