// Schema lives in a TS string (not a .sql file read from disk) because `tsc`
// doesn't copy non-TS assets into dist/, so a compiled deploy
// (node dist/mcp/http-server.js) would otherwise have no way to find it.
// SQLite for local dev; the shape maps 1:1 onto Postgres when you move to
// Supabase/Neon for a persistent deployment.
export const SCHEMA_SQL = `
-- TutorFlow schema. SQLite for local dev; the shape maps 1:1 onto Postgres
-- when you move to Supabase/Neon for deployment (see README "Deploying").

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  grade TEXT,
  subject_focus TEXT,
  parent_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  session_date TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS homework_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  description TEXT NOT NULL,
  due_date TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS progress_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
