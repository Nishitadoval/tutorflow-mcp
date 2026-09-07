import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/client.js";
import type { StudentRow } from "../../types.js";

/**
 * log_session_note
 *
 * Write tool. Unlike the two read-only tools, this changes data — so it
 * requires an explicit confirm: true before it actually writes anything.
 * Called without confirm, it echoes back exactly what it's about to write
 * and stops, giving the person (or the agent, if it's being cautious) a
 * chance to review before committing. This is the pattern every write tool
 * in this project follows.
 */
export function registerLogSessionNote(server: McpServer) {
  server.tool(
    "log_session_note",
    "Log a note for a tutoring session. By default this only PREVIEWS the " +
      "note and does not save it — call again with confirm: true to actually write it. " +
      "Use list_students first if you don't know the student_id.",
    {
      student_id: z.number().int().describe("The student's id, from list_students"),
      session_date: z
        .string()
        .describe("Date of the session, e.g. 2026-09-06 (YYYY-MM-DD)"),
      note: z.string().min(1).describe("What happened in the session"),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set true to actually save the note. Defaults to false (preview only)."),
    },
    async ({ student_id, session_date, note, confirm }) => {
      const student = db
        .prepare(`SELECT * FROM students WHERE id = ?`)
        .get(student_id) as StudentRow | undefined;

      if (!student) {
        return {
          content: [{ type: "text", text: `No student found with id ${student_id}.` }],
          isError: true,
        };
      }

      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text:
                `Preview only — nothing saved yet.\n\n` +
                `Student: ${student.name}\nDate: ${session_date}\nNote: "${note}"\n\n` +
                `To save this, call log_session_note again with the same arguments plus confirm: true.`,
            },
          ],
        };
      }

      db.prepare(
        `INSERT INTO sessions (student_id, session_date, note) VALUES (?, ?, ?)`
      ).run(student_id, session_date, note);

      return {
        content: [
          { type: "text", text: `Saved session note for ${student.name} (${session_date}).` },
        ],
      };
    }
  );
}
