import { db } from "../db/client.js";
import type { StudentRow } from "../types.js";

export function listStudents(search?: string): StudentRow[] {
  if (search) {
    return db
      .prepare(
        `SELECT * FROM students WHERE name LIKE ? OR subject_focus LIKE ? ORDER BY name`
      )
      .all(`%${search}%`, `%${search}%`) as StudentRow[];
  }
  return db.prepare(`SELECT * FROM students ORDER BY name`).all() as StudentRow[];
}

export function getStudentById(studentId: number): StudentRow | undefined {
  return db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId) as
    | StudentRow
    | undefined;
}
