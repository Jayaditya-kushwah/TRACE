import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  console.log("Starting database migrations...");
  const schemaPath = path.join(__dirname, "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.error("Migration failed: schema.sql not found at", schemaPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, "utf8");
  const client = await pool.connect();
  try {
    console.log("Executing schema.sql...");
    await client.query(sql);
    console.log("Database schema successfully initialized/updated!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
