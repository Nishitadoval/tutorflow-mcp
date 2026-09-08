# TutorFlow MCP

An MCP (Model Context Protocol) server that exposes a tutoring workflow —
students, session notes, homework, progress — as tools an AI agent (Claude
Desktop, Cursor, Claude Code) can call directly. Instead of opening a
dashboard to check "how is Aiden doing," you can just ask.

## Why this exists

Tutors juggle student-specific context (what was covered, what's still
shaky, what's due) across notebooks, texts, and memory. This project puts
that context behind a small set of well-defined tools so an AI assistant can
answer questions and log updates on your behalf, without you re-explaining
context every session.

## Status

Five tools implemented and smoke-tested end to end (write tools and the
report tool's error path all verified with a scripted MCP client; the
report tool's actual LLM call needs your own `ANTHROPIC_API_KEY` to try live):

- `list_students` — list all students, optionally filtered by name/subject
- `get_student_progress` — recent session notes + open homework for one student
- `log_session_note` — **write.** Defaults to preview-only; pass `confirm: true` to save.
- `assign_homework` — **write.** Same preview/`confirm: true` pattern.
- `generate_progress_report` — the one tool that reasons rather than just
  fetches: calls the Anthropic API to turn shorthand session notes into a
  short, parent-friendly summary. Defaults to draft-only; pass `save: true`
  to store it in `progress_notes`. Requires `ANTHROPIC_API_KEY`.
- `delete_homework` — **write (deletion).** Same preview/`confirm: true`
  pattern. `get_student_progress` now shows each homework item's id, which
  this tool needs — useful for cleaning up accidental duplicates.

Streamable HTTP transport is also implemented (`src/mcp/http-server.ts`) —
tested end to end with a real HTTP client: unauthenticated requests
correctly rejected, session creation, `tools/list`, `tools/call`, and
session termination all verified.

Planned next (see build plan):

- Angular dashboard as a second frontend onto the same data

## Architecture

```
Claude Desktop (local)          Claude.ai / remote client
        │  stdio                        │  Streamable HTTP
        ▼                               ▼
  src/mcp/server.ts          src/mcp/http-server.ts
  (spawned subprocess)       (Express + session map + bearer auth)
        └───────────────┬───────────────┘
                         ▼
              src/mcp/createServer.ts
              — builds a fresh McpServer, registers all 5 tools
                         │
                         ▼
              src/mcp/tools/*.ts  — one file per tool: zod schema + handler
                         │
                         ▼
              src/db/client.ts   — SQLite connection (better-sqlite3)
              tutorflow.db        — local dev database
```

Both entry points share the same tool implementations via
`createTutorFlowServer()` — the tools themselves don't know or care whether
they're being called over stdio or HTTP.

Each tool file follows the same shape on purpose: a zod schema for
arguments, a handler that queries the DB, and a `registerX(server)` function
called once from `server.ts`. Adding tool #3 means adding one file and one
line in `server.ts` — nothing else changes.

## Setup

```bash
npm install
npm run db:init   # creates tutorflow.db and seeds 2 sample students
npm run dev        # starts the MCP server on stdio
```

## Try it with Claude Desktop

Add this to your Claude Desktop MCP config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "tutorflow": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/tutorflow-mcp/src/mcp/server.ts"]
    }
  }
}
```

Restart Claude Desktop, then try asking: *"List my students"* or *"How is
Aiden doing?"*

## Running the HTTP server locally

```bash
# .env needs DB_PATH, ANTHROPIC_API_KEY (optional), and MCP_AUTH_TOKEN (recommended)
npm run dev:http
```

Visit `http://localhost:3000/health` to confirm it's up. If `MCP_AUTH_TOKEN`
is set, every `/mcp` request needs `Authorization: Bearer <token>` or it's
rejected with 401 — this is a single shared secret, fine for a solo demo,
not real per-user auth.

## Deploying

1. Push this repo (see `.gitignore` — `node_modules`, `dist`, and `*.db`
   are already excluded).
2. On Render or Railway, create a new web service pointing at the repo with
   build command `npm install && npm run build` and start command
   `npm run start:http`.
3. Set environment variables on the platform: `ANTHROPIC_API_KEY`,
   `MCP_AUTH_TOKEN` (generate a random string — this is your server's
   password, keep it secret), and optionally `DB_PATH` if you want the
   SQLite file somewhere specific. `PORT` is usually set automatically by
   the platform.
4. Note SQLite lives on local disk — fine for a demo, but if the platform's
   filesystem isn't persistent across deploys/restarts your data resets.
   For anything beyond a portfolio demo, swap `better-sqlite3` for a
   Postgres client (`pg`) pointed at a free Supabase/Neon instance instead —
   the query shapes in `src/mcp/tools/*.ts` stay almost identical.

## Connecting a remote client to the deployed server

Two ways, depending on what your Claude plan/client supports:

**A. Native custom connector** (Claude.ai/Desktop, Pro plan or above) —
Settings → Connectors → Add custom connector → paste your deployed URL
(`https://your-app.onrender.com/mcp`). If your account has the "Request
headers" option under Advanced settings, add
`Authorization: Bearer <your MCP_AUTH_TOKEN>` there. If that option isn't
available yet, use option B instead.

**B. `mcp-remote` bridge** (works today, any account) — add this to
`claude_desktop_config.json` instead of a local `command`/`args` block.
Windows note: pass the header via an env var to avoid Claude Desktop
mangling the spaces in the value:

```json
{
  "mcpServers": {
    "tutorflow": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-app.onrender.com/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer your-mcp-auth-token" }
    }
  }
}
```

## Guardrails note

`log_session_note`, `assign_homework`, `delete_homework`, and
`generate_progress_report` (when saving) all default to a **preview-only**
response and only write when called again with `confirm: true` (or
`save: true` for the report). This means an agent can't silently write to
or delete your data on a single ambiguous request — it has to show you
exactly what it's about to change first. Worth keeping this pattern for
every future write tool.

## Setting ANTHROPIC_API_KEY

Two ways to provide it, depending on how you're running the server:

- **Local dev (`npm run dev`)** — copy `.env.example` to `.env` and fill in
  the key. Loaded automatically via `dotenv/config`.
- **Via Claude Desktop** — add it to the server's config block instead, so
  it's set before the process starts:
  ```json
  {
    "mcpServers": {
      "tutorflow": {
        "command": "npx.cmd",
        "args": ["tsx", "D:\\tutorflow-mcp\\src\\mcp\\server.ts"],
        "cwd": "D:\\tutorflow-mcp",
        "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
      }
    }
  }
  ```
