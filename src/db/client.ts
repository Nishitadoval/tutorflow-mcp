import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One shared connection for the process. Fine for a single-user MCP server;
// swap for a pooled Postgres client (pg) if you move to Supabase/Neon.
const dbPath = process.env.DB_PATH ?? path.join(__dirname, "../../tutorflow.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
