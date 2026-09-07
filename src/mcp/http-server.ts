import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createTutorFlowServer } from "./createServer.js";

/**
 * Deployable HTTP entry point. Run this instead of server.ts when hosting
 * on Render/Railway/etc. so the MCP server is reachable over the network
 * rather than only spawnable as a local subprocess.
 *
 * Uses stateful sessions: the first request (an "initialize") gets a new
 * session id and its own McpServer + transport pair, tracked in-memory in
 * `transports` below. Every later request from that client includes the
 * Mcp-Session-Id header and gets routed to its existing transport. This
 * matches the pattern in the MCP SDK's own Streamable HTTP examples.
 *
 * Auth: if MCP_AUTH_TOKEN is set, every request must include
 * `Authorization: Bearer <token>`. This is a single shared secret, not
 * per-user auth — enough to keep a demo deployment from being open to
 * anyone who finds the URL, not a substitute for real auth if this ever
 * serves more than one person.
 */

const PORT = process.env.PORT ?? 3000;
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.warn(
    "MCP_AUTH_TOKEN is not set — this server will accept unauthenticated requests. " +
      "Set it before deploying anywhere publicly reachable."
  );
}

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "Mcp-Session-Id", "Authorization"],
  })
);

function checkAuth(req: express.Request, res: express.Response): boolean {
  if (!AUTH_TOKEN) return true; // auth disabled — see warning above
  const header = req.headers.authorization;
  if (header === `Bearer ${AUTH_TOKEN}`) return true;
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
  return false;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
        console.error(`Session initialized: ${sid}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        console.error(`Session closed: ${transport.sessionId}`);
      }
    };

    const server = createTutorFlowServer();
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID provided" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET is used for the server-to-client notification stream on an existing session.
app.get("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// DELETE lets a client explicitly end its session.
app.delete("/mcp", async (req, res) => {
  if (!checkAuth(req, res)) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(PORT, () => {
  console.error(`tutorflow-mcp HTTP server listening on port ${PORT}`);
});
