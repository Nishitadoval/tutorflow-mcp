import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStudentById } from "../../services/students.js";
import { listRecentSessions } from "../../services/sessions.js";
import { draftProgressReport, saveProgressReport } from "../../services/progressReports.js";

/**
 * generate_progress_report
 *
 * The one tool that reasons over data instead of just fetching or writing
 * it: pulls a student's recent session notes and calls Claude to turn
 * shorthand tutor notes into a short, parent-readable summary. Same
 * confirm-before-write shape (save: true) as the other write tools. Thin
 * wrapper over the shared progressReports service.
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
      const student = getStudentById(student_id);

      if (!student) {
        return {
          content: [{ type: "text", text: `No student found with id ${student_id}.` }],
          isError: true,
        };
      }

      const sessions = listRecentSessions(student_id, 8);

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

      let summary: string;
      try {
        summary = await draftProgressReport(student, sessions);
      } catch {
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

      saveProgressReport(student_id, summary);

      return {
        content: [{ type: "text", text: `Saved progress report for ${student.name}:\n\n${summary}` }],
      };
    }
  );
}
