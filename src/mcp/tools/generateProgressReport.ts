import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../db/client.js";
import type { StudentRow, SessionRow } from "../../types.js";

/**
 * generate_progress_report
 *
 * This is the one tool in the project that reasons over data instead of
 * just fetching or writing it: it pulls a student's recent session notes
 * and homework history, then calls Claude to turn shorthand tutor notes
 * into a short, parent-readable summary.
 *
 * Same confirm-before-write shape as the other write tools: without
 * save: true it only returns the draft. Requires ANTHROPIC_API_KEY to be
 * set in the environment (see .env.example / README).
 */
export function registerGenerateProgressReport(server: McpServer) {
  server.tool(
    "generate_progress_report",
    "Generate a parent-friendly progress summary for a student by having an LLM " +
      "reason over their recent session notes and homework. Returns a draft by default " +
      "— call again with save: true to store it in progress_notes. Requires ANTHROPIC_API_KEY.",
    {
      student_id: z.number().int().describe("The student's id, from list_students"),
      save: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set true to store the generated report. Defaults to false (draft only)."),
    },
    async ({ student_id, save }) => {
      const student = db
        .prepare(`SELECT * FROM students WHERE id = ?`)
        .get(student_id) as StudentRow | undefined;

      if (!student) {
        return {
          content: [{ type: "text", text: `No student found with id ${student_id}.` }],
          isError: true,
        };
      }

      const sessions = db
        .prepare(
          `SELECT * FROM sessions WHERE student_id = ? ORDER BY session_date DESC LIMIT 8`
        )
        .all(student_id) as SessionRow[];

      if (sessions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `${student.name} has no logged sessions yet — nothing to summarize. Log a session note first.`,
            },
          ],
        };
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        return {
          content: [
            {
              type: "text",
              text:
                "ANTHROPIC_API_KEY is not set, so I can't call the LLM to draft this report. " +
                "Add it to your .env (see .env.example) and restart the server.",
            },
          ],
          isError: true,
        };
      }

      const notesText = sessions
        .map((s) => `- ${s.session_date}: ${s.note}`)
        .join("\n");

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

      const summaryBlock = response.content.find((b) => b.type === "text");
      const summary = summaryBlock && summaryBlock.type === "text" ? summaryBlock.text : "";

      if (!save) {
        return {
          content: [
            {
              type: "text",
              text: `Draft only — not saved.\n\n${summary}\n\nCall again with save: true to store this in progress_notes.`,
            },
          ],
        };
      }

      db.prepare(
        `INSERT INTO progress_notes (student_id, summary) VALUES (?, ?)`
      ).run(student_id, summary);

      return {
        content: [{ type: "text", text: `Saved progress report for ${student.name}:\n\n${summary}` }],
      };
    }
  );
}
