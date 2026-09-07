import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/client.js";
import type { StudentRow } from "../../types.js";

/**
 * list_students
 *
 * Read-only tool. Returns all students, optionally filtered by a text match
 * against name or subject_focus. This is the template every other tool in
 * this project follows:
 *   1. zod schema describes the arguments (empty object here — no required input)
 *   2. handler runs a query and returns MCP "content" blocks
 *   3. registration is a single server.tool(...) call, kept in its own file
 *      so tools stay independently testable and easy to add to.
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
      const rows = search
        ? (db
            .prepare(
              `SELECT * FROM students
               WHERE name LIKE ? OR subject_focus LIKE ?
               ORDER BY name`
            )
            .all(`%${search}%`, `%${search}%`) as StudentRow[])
        : (db.prepare(`SELECT * FROM students ORDER BY name`).all() as StudentRow[]);

      if (rows.length === 0) {
        return {
          content: [{ type: "text", text: "No students found." }],
        };
      }

      const summary = rows
        .map(
          (s) =>
            `#${s.id} ${s.name} — ${s.grade ?? "grade unknown"} — focus: ${
              s.subject_focus ?? "none set"
            }`
        )
        .join("\n");

      return {
        content: [{ type: "text", text: summary }],
      };
    }
  );
}
