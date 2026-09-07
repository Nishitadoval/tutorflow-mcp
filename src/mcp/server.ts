import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTutorFlowServer } from "./createServer.js";

/**
 * stdio entry point — used for local development and Claude Desktop, which
 * spawns this as a subprocess and talks to it over stdin/stdout. See
 * http-server.ts for the deployable, network-reachable version.
 */
async function main() {
  const server = createTutorFlowServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("tutorflow-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting tutorflow-mcp:", err);
  process.exit(1);
});
