import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createApiRouter } from "./router.js";
import { bootstrapDatabase } from "../db/bootstrap.js";

/**
 * Standalone REST API process for local development (npm run dev:api).
 * For deployment, mcp/http-server.ts mounts the same router alongside the
 * MCP transport so one service handles both — see that file. This entry
 * point still exists so you can develop and test the dashboard's backend
 * on its own port without also standing up the MCP transport.
 *
 * Access control, honestly stated: this is a public-facing SPA, so there's
 * no way to hide a shared secret from anyone who opens the browser's
 * network tab. Rather than pretend otherwise with a fake-secure token,
 * this restricts CORS to the one known dashboard origin (DASHBOARD_ORIGIN)
 * and rate-limits every route. Good enough for a public demo seeded with
 * fake data, not a substitute for real auth on anything that matters.
 */

const PORT = process.env.API_PORT ?? 3001;
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN;

if (!DASHBOARD_ORIGIN) {
  console.warn(
    "DASHBOARD_ORIGIN is not set — this API will accept requests from any origin. " +
      "Set it to your deployed dashboard's exact URL before treating this as a real public deployment."
  );
}

bootstrapDatabase({ seedIfEmpty: false });

const app = express();
app.use(express.json());
app.use(cors({ origin: DASHBOARD_ORIGIN ?? "*" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — slow down and try again shortly." },
  })
);

app.use("/api", createApiRouter());
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.error(`tutorflow REST API listening on port ${PORT}`);
});
