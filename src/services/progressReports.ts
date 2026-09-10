import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/client.js";
import type { ProgressNoteRow, SessionRow, StudentRow } from "../types.js";

/**
 * Calls Claude to turn a student's recent session notes into a short,
 * parent-friendly summary. Throws if ANTHROPIC_API_KEY isn't set — callers
 * (both the MCP tool and the REST route) are responsible for catching that
 * and returning an appropriate message in their own response shape.
 */
export async function draftProgressReport(
  student: StudentRow,
  sessions: SessionRow[]
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const notesText = sessions.map((s) => `- ${s.session_date}: ${s.note}`).join("\n");

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content:
          `You are a tutor's assistant. Turn the following shorthand tutoring session notes ` +
          `for a student named ${student.name} (${student.grade ?? "grade unknown"}, focus: ` +
          `${student.subject_focus ?? "not set"}) into a short, warm, parent-friendly progress ` +
          `update — 3-4 sentences. Mention concrete strengths and one area still developing. ` +
          `Do not invent details not present in the notes.\n\nSession notes:\n${notesText}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

export function listProgressReports(studentId: number): ProgressNoteRow[] {
  return db
    .prepare(`SELECT * FROM progress_notes WHERE student_id = ? ORDER BY created_at DESC`)
    .all(studentId) as ProgressNoteRow[];
}

export function saveProgressReport(studentId: number, summary: string): ProgressNoteRow {
  const result = db
    .prepare(`INSERT INTO progress_notes (student_id, summary) VALUES (?, ?)`)
    .run(studentId, summary);
  return db
    .prepare(`SELECT * FROM progress_notes WHERE id = ?`)
    .get(result.lastInsertRowid) as ProgressNoteRow;
}
