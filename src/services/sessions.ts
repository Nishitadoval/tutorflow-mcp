import { db } from "../db/client.js";
import type { SessionRow } from "../types.js";

export function listRecentSessions(studentId: number, limit = 5): SessionRow[] {
  return db
    .prepare(`SELECT * FROM sessions WHERE student_id = ? ORDER BY session_date DESC LIMIT ?`)
    .all(studentId, limit) as SessionRow[];
}

export function logSessionNote(studentId: number, sessionDate: string, note: string): SessionRow {
  const result = db
    .prepare(`INSERT INTO sessions (student_id, session_date, note) VALUES (?, ?, ?)`)
    .run(studentId, sessionDate, note);
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(result.lastInsertRowid) as SessionRow;
}
