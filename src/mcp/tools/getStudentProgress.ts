import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStudentById } from "../../services/students.js";
import { listRecentSessions } from "../../services/sessions.js";
import { listOpenHomework } from "../../services/homework.js";

/**
 * get_student_progress
 *
 * Read-only tool. Given a student_id, returns recent session notes and open
 * homework so an agent (or you, via chat) can answer "how is Aiden doing?"
 * without opening the dashboard. Thin wrapper over the shared services —
 * the REST API's GET /api/students/:id route composes the same three calls.
 */
export function registerGetStudentProgress(server: McpServer) {
  server.tool(
    "get_student_progress",
    "Get a student's recent session notes and open homework by student id. " +
      "Use list_students first if you don't know the id.",
    {
      student_id: z.number().int().describe("The student's id, from list_students"),
    },
    async ({ student_id }) => {
      const student = getStudentById(student_id);

      if (!student) {
        return {
          content: [{ type: "text", text: `No student found with id ${student_id}.` }],
          isError: true,
        };
      }

      const sessions = listRecentSessions(student_id, 5);
      const homework = listOpenHomework(student_id);

      const sessionText = sessions.length
        ? sessions.map((s) => `- ${s.session_date}: ${s.note}`).join("\n")
        : "No sessions logged yet.";

      const homeworkText = homework.length
        ? homework
            .map((h) => `- [id ${h.id}] ${h.description} (due ${h.due_date ?? "no date"})`)
            .join("\n")
        : "No open homework.";

      const text = `${student.name} (${student.grade ?? "grade unknown"}, focus: ${
        student.subject_focus ?? "none set"
      })\n\nRecent sessions:\n${sessionText}\n\nOpen homework:\n${homeworkText}`;

      return { content: [{ type: "text", text }] };
    }
  );
}
