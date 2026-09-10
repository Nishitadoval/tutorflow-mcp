import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStudentById } from "../../services/students.js";
import { getHomeworkById, deleteHomeworkById } from "../../services/homework.js";

/**
 * delete_homework
 *
 * Write tool (deletion). Same confirm-before-write shape as the other write
 * tools. Use get_student_progress first to find the homework_id.
 */
export function registerDeleteHomework(server: McpServer) {
  server.tool(
    "delete_homework",
    "Delete a homework item by its id. By default this only PREVIEWS what would " +
      "be deleted and does not remove it — call again with confirm: true to actually delete. " +
      "Use get_student_progress first to find the homework_id.",
    {
      homework_id: z.number().int().describe("The homework item's id, shown by get_student_progress"),
      confirm: z
        .boolean()
        .optional()
        .default(false)
        .describe("Set true to actually delete the item. Defaults to false (preview only)."),
    },
    async ({ homework_id, confirm }) => {
      const item = getHomeworkById(homework_id);

      if (!item) {
        return {
          content: [{ type: "text", text: `No homework item found with id ${homework_id}.` }],
          isError: true,
        };
      }

      const student = getStudentById(item.student_id);

      if (!confirm) {
        return {
          content: [
            {
              type: "text",
              text:
                `Preview only — nothing deleted yet.\n\n` +
                `Would delete homework #${item.id} for ${student?.name ?? "unknown student"}: ` +
                `"${item.description}" (due ${item.due_date ?? "no date"})\n\n` +
                `To delete this, call delete_homework again with the same homework_id plus confirm: true.`,
            },
          ],
        };
      }

      deleteHomeworkById(homework_id);

      return {
        content: [
          {
            type: "text",
            text: `Deleted homework #${homework_id} for ${student?.name ?? "unknown student"}.`,
          },
        ],
      };
    }
  );
}
