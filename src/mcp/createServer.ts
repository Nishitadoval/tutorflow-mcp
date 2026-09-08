import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListStudents } from "./tools/listStudents.js";
import { registerGetStudentProgress } from "./tools/getStudentProgress.js";
import { registerLogSessionNote } from "./tools/logSessionNote.js";
import { registerAssignHomework } from "./tools/assignHomework.js";
import { registerDeleteHomework } from "./tools/deleteHomework.js";
import { registerGenerateProgressReport } from "./tools/generateProgressReport.js";

/**
 * Builds a fresh McpServer instance with every tool registered.
 *
 * Called once for the single stdio server (local Claude Desktop use), and
 * once per new session for the HTTP transport (each concurrent client gets
 * its own McpServer instance — a McpServer is meant to be paired with one
 * transport connection at a time).
 */
export function createTutorFlowServer(): McpServer {
  const server = new McpServer({
    name: "tutorflow-mcp",
    version: "0.1.0",
  });

  // One registerX(server) call per tool — add new tools here the same way.
  registerListStudents(server);
  registerGetStudentProgress(server);
  registerLogSessionNote(server);
  registerAssignHomework(server);
  registerDeleteHomework(server);
  registerGenerateProgressReport(server);

  return server;
}
