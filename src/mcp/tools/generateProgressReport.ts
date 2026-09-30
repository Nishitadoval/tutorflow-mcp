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
 * shorthand tutor notes into a short, parent-readable summary.
 *
 * Save flow is deliberately two-step and exact: call without `save` to get
 * a draft, then call again with save: true AND the same `summary` text
 * (copy it from the draft response) to persist exactly that text. Passing
 * save: true without `summary` is rejected rather than silently drafting a
 * *new* summary and saving that instead — an LLM call isn't deterministic,
 * so re-generating on save would mean the text you reviewed isn't the text
 * that gets stored, quietly breaking the preview-then-confirm guarantee
 * every other write tool in this project relies on.
 */
export function registerGenerateProgressReport(server: McpServer) {
  server.tool(
    "generate_progress_report",
    "Generate a parent-friendly progress summary for a student by having an LLM " +
      "reason over their recent session notes. Call without save to get a draft. " +
      "To store it, call again with save: true AND summary set to the exact draft text " +
      "— this saves precisely what you reviewed rather than generating a new one. " +
      "Requires ANTHROPIC_API_KEY.",
    {
      student_id: z.number().int().describe("The student's id, from list_students"),
      save: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set true to store a report. Defaults to false (draft only)."),
      summary: z
        .string()
        .optional()
        .describe(
          "Required when save is true: the exact summary text to store, copied from a prior draft call."
        ),
    },
    async ({ student_id, save, summary }) => {
      const student = getStudentById(student_id);

      if (!student) {
        return {
          content: [{ type: "text", text: `No student found with id ${student_id}.` }],
          isError: true,
        };
      }

      if (save) {
        if (!summary) {
          return {
            content: [
              {
                type: "text",
                text:
                  "To save a report, first call generate_progress_report without save to get a draft, " +
                  "then call again with save: true and summary set to that exact draft text.",
              },
            ],
            isError: true,
          };
        }
        saveProgressReport(student_id, summary);
        return {
          content: [
            { type: "text", text: `Saved progress report for ${student.name}:\n\n${summary}` },
          ],
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

      let draft: string;
      try {
        draft = await draftProgressReport(student, sessions);
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

      return {
        content: [
          {
            type: "text",
            text: `Draft only — not saved.\n\n${draft}\n\nTo save this exact text, call again with save: true and summary set to it.`,
          },
        ],
      };
    }
  );
}
