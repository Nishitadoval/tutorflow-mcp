import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createTutorFlowServer } from "./createServer.js";
import { createApiRouter } from "../api/router.js";
import { bootstrapDatabase } from "../db/bootstrap.js";

/**
 * Deployable HTTP entry point — the one process meant for Render/Railway.
 * Serves THREE things on one port, since a single free-tier service is the
 * practical choice for a portfolio deployment:
 *   - /mcp   — the MCP Streamable HTTP transport, for AI agents
 *   - /api   — the same REST routes api/server.ts exposes standalone, for
 *              the deployed Angular dashboard (mounted from api/router.ts
 *              so the route logic isn't duplicated between the two entry
 *              points)
 *   - /health, / — status/landing
 *
 * MCP auth: if MCP_AUTH_TOKEN is set, every /mcp request needs
 * `Authorization: Bearer <token>`. This is a single shared secret, not
 * per-user auth — enough to keep a demo deployment from being open to
 * anyone who finds the URL.
 *
 * REST API access control, honestly stated: this is a public-facing SPA,
 * so there's no way to hide a shared secret from anyone who opens the
 * browser's network tab — a static frontend can't authenticate the way a
 * server-side client can. Rather than pretend otherwise, /api instead (a)
 * restricts CORS to the one known dashboard origin via DASHBOARD_ORIGIN,
 * and (b) rate-limits every route so even direct requests can't be used to
 * spam or scrape it. Good enough for a public demo seeded with fake data,
 * not a substitute for real auth on anything that matters.
 */

const PORT = process.env.PORT ?? 3000;
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN;

// Hosted free tiers wipe the disk on every deploy/restart, so the server
// creates its own tables on startup instead of relying on a manual
// `db:init`. It also seeds a few demo students when the database is empty
// so a fresh deploy has something to show (and a restart quietly undoes any
// vandalism of the public demo). Set SEED_DEMO_DATA=false to skip seeding.
const { seeded } = bootstrapDatabase({ seedIfEmpty: process.env.SEED_DEMO_DATA !== "false" });
console.error(seeded ? "Database was empty — seeded demo students." : "Database ready.");

if (!AUTH_TOKEN) {
  console.warn(
    "MCP_AUTH_TOKEN is not set — /mcp will accept unauthenticated requests. " +
      "Set it before deploying anywhere publicly reachable."
  );
}
if (!DASHBOARD_ORIGIN) {
  console.warn(
    "DASHBOARD_ORIGIN is not set — /api will accept requests from any origin. " +
      "Set it to your deployed dashboard's exact URL before treating this as a real public deployment."
  );
}

const app = express();
app.use(express.json());

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

app.get("/", (_req, res) => {
  res.json({
    name: "tutorflow-mcp",
    status: "running",
    description:
      "MCP server exposing a tutoring workflow (students, sessions, homework, progress reports) to AI agents, plus a REST API for the companion Angular dashboard.",
    endpoints: {
      health: "GET /health",
      mcp: "POST/GET/DELETE /mcp — not a webpage; connect with an MCP client (see project README)",
      api: "GET/POST/PATCH/DELETE /api/* — REST API for the dashboard",
    },
    source: "https://github.com/YOUR_USERNAME/tutorflow-mcp",
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// --- /api: REST routes for the dashboard, scoped CORS + rate limiting ---
const apiRouter = express.Router();
apiRouter.use(cors({ origin: DASHBOARD_ORIGIN ?? "*" }));
apiRouter.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — slow down and try again shortly." },
  })
);
apiRouter.use(createApiRouter());
app.use("/api", apiRouter);

// --- /mcp: MCP Streamable HTTP transport, its own CORS for the protocol's
// required headers, separate from the dashboard's CORS above ---
app.use(
  "/mcp",
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "Mcp-Session-Id", "Authorization"],
  })
);

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
  console.error(`tutorflow-mcp HTTP server listening on port ${PORT} (MCP at /mcp, REST API at /api)`);
});
