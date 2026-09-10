import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listStudents as listStudentsService } from "../../services/students.js";

/**
 * list_students
 *
 * Read-only tool. Returns all students, optionally filtered by a text match
 * against name or subject_focus. Thin wrapper over the shared students
 * service — the REST API's GET /api/students route uses the same function.
 */
export function registerListStudents(server: McpServer) {
  server.tool(
    "list_students",
    "List all students being tutored, with their grade and subject focus. " +
      "Optionally filter by a search term matched against name or subject.",
    {
      search: z
        .string()
        .optional()
        .describe("Optional text to match against student name or subject_focus"),
    },
    async ({ search }) => {
      const rows = listStudentsService(search);

      if (rows.length === 0) {
        return { content: [{ type: "text", text: "No students found." }] };
      }

      const summary = rows
        .map(
          (s) =>
            `#${s.id} ${s.name} — ${s.grade ?? "grade unknown"} — focus: ${
              s.subject_focus ?? "none set"
            }`
        )
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    }
  );
}
