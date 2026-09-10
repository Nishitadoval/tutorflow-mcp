import { db } from "../db/client.js";
import type { HomeworkRow } from "../types.js";

export function listOpenHomework(studentId: number): HomeworkRow[] {
  return db
    .prepare(
      `SELECT * FROM homework_items WHERE student_id = ? AND completed = 0 ORDER BY due_date ASC`
    )
    .all(studentId) as HomeworkRow[];
}

export function getHomeworkById(homeworkId: number): HomeworkRow | undefined {
  return db.prepare(`SELECT * FROM homework_items WHERE id = ?`).get(homeworkId) as
    | HomeworkRow
    | undefined;
}

export function assignHomework(
  studentId: number,
  description: string,
  dueDate?: string | null
): HomeworkRow {
  const result = db
    .prepare(`INSERT INTO homework_items (student_id, description, due_date) VALUES (?, ?, ?)`)
    .run(studentId, description, dueDate ?? null);
  return db
    .prepare(`SELECT * FROM homework_items WHERE id = ?`)
    .get(result.lastInsertRowid) as HomeworkRow;
}

export function deleteHomeworkById(homeworkId: number): boolean {
  const result = db.prepare(`DELETE FROM homework_items WHERE id = ?`).run(homeworkId);
  return result.changes > 0;
}

/** New: not used by any MCP tool yet, but the dashboard's homework tracker
 * needs a way to check items off — a natural UI action that doesn't need
 * the preview/confirm ceremony the MCP write tools use, since the UI's own
 * checkbox interaction already is the confirmation. */
export function setHomeworkCompleted(homeworkId: number, completed: boolean): HomeworkRow | undefined {
  db.prepare(`UPDATE homework_items SET completed = ? WHERE id = ?`).run(completed ? 1 : 0, homeworkId);
  return getHomeworkById(homeworkId);
}
