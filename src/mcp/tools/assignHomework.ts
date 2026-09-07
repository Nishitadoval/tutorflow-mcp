import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/client.js";
import type { StudentRow } from "../../types.js";

/**
 * assign_homework
 *
 * Write tool. Same confirm-before-write shape as log_session_note: without
 * confirm: true it only previews what would be created.
 */
export function registerAssignHomework(server: McpServer) {
  server.tool(
    "assign_homework",
    "Assign a homework item to a student. By default this only PREVIEWS the " +
      "assignment and does not save it — call again with confirm: true to actually create it. " +
      "Use list_students first if you don't know the student_id.",
    {
      student_id: z.number().int().describe("The student's id, from list_students"),
      description: z.string().min(1).describe("What the homework is"),
      due_date: z
        .string()
        .optional()
        .describe("Due date, e.g. 2026-09-12 (YYYY-MM-DD). Omit if there's no fixed due date."),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set true to actually create the assignment. Defaults to false (preview only)."),
    },
    async ({ student_id, description, due_date, confirm }) => {
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
                `Student: ${student.name}\nHomework: "${description}"\nDue: ${
                  due_date ?? "no date set"
                }\n\n` +
                `To save this, call assign_homework again with the same arguments plus confirm: true.`,
            },
          ],
        };
      }

      db.prepare(
        `INSERT INTO homework_items (student_id, description, due_date) VALUES (?, ?, ?)`
      ).run(student_id, description, due_date ?? null);

      return {
        content: [
          { type: "text", text: `Assigned homework to ${student.name}: "${description}"` },
        ],
      };
    }
  );
}
