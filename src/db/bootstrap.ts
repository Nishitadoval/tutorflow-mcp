import { db } from "./client.js";
import { SCHEMA_SQL } from "./schema.js";

/**
 * Creates the tables if they don't exist (idempotent — safe on every
 * startup, and safe against an existing database with real data), and
 * optionally seeds a few demo students if the students table is empty.
 *
 * This exists because hosts like Render's free tier give you an ephemeral
 * disk: every deploy/restart starts from an empty filesystem, so relying on
 * a manual `npm run db:init` means the deployed API breaks ("no such
 * table") the first time it restarts.
 *
 * Returns what it did so callers can log it — deliberately doesn't write to
 * stdout itself, since the stdio MCP server uses stdout for the protocol.
 */
export function bootstrapDatabase(options: { seedIfEmpty: boolean }): { seeded: boolean } {
  db.exec(SCHEMA_SQL);

  if (!options.seedIfEmpty) return { seeded: false };

  const count = db.prepare("SELECT COUNT(*) as n FROM students").get() as { n: number };
  if (count.n > 0) return { seeded: false };

  const insertStudent = db.prepare(
    "INSERT INTO students (name, grade, subject_focus, parent_email) VALUES (?, ?, ?, ?)"
  );
  const { lastInsertRowid: aidenId } = insertStudent.run(
    "Aiden P.",
    "Grade 3",
    "Writing & reading comprehension",
    "parent1@example.com"
  );
  insertStudent.run("Mia T.", "Grade 5", "Essay structure", "parent2@example.com");

  db.prepare("INSERT INTO sessions (student_id, session_date, note) VALUES (?, ?, ?)").run(
    aidenId,
    "2026-08-25",
    "Worked on paragraph structure. Still mixing up 'their/there'. Confident with reading aloud."
  );

  db.prepare("INSERT INTO homework_items (student_id, description, due_date) VALUES (?, ?, ?)").run(
    aidenId,
    "Write 5 sentences using 'their' and 'there' correctly",
    "2026-09-05"
  );

  return { seeded: true };
}
