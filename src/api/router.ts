import express from "express";
import { listStudents, getStudentById } from "../services/students.js";
import { listRecentSessions, logSessionNote } from "../services/sessions.js";
import {
  listOpenHomework,
  getHomeworkById,
  assignHomework,
  deleteHomeworkById,
  setHomeworkCompleted,
  countOverdueByStudent,
} from "../services/homework.js";
import {
  draftProgressReport,
  saveProgressReport,
  listProgressReports,
} from "../services/progressReports.js";

/**
 * REST routes for the Angular dashboard, as a mountable router rather than
 * a standalone app — used both by api/server.ts (a standalone process for
 * local dev, on its own port) and mcp/http-server.ts (which mounts this at
 * /api alongside the MCP transport, so one deployed service serves both).
 *
 * Built on the exact same services and SQLite database as the MCP tools
 * (see src/services/*.ts) — this is the "human via UI" interface onto the
 * same data the "AI agent via MCP" interface uses. Neither one is the
 * source of truth for the other; the DB is, and both sit on top of it.
 *
 * Note on write semantics: the MCP write tools use a preview-then-confirm
 * round trip because an agent might otherwise act on ambiguous instructions
 * unsupervised. Here, a human clicking a UI button (with the browser-side
 * confirm dialog Angular shows before a delete) serves the same purpose,
 * so these routes just perform the action directly.
 */
export function createApiRouter(): express.Router {
  const router = express.Router();

  router.get("/students", (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const students = listStudents(search);
    const overdueCounts = countOverdueByStudent();
    res.json(students.map((s) => ({ ...s, overdue_homework_count: overdueCounts[s.id] ?? 0 })));
  });

  router.get("/students/:id", (req, res) => {
    const id = Number(req.params.id);
    const student = getStudentById(id);
    if (!student) {
      res.status(404).json({ error: `No student found with id ${id}` });
      return;
    }
    res.json({
      student,
      sessions: listRecentSessions(id, 10),
      homework: listOpenHomework(id),
      progressReports: listProgressReports(id),
    });
  });

  router.post("/students/:id/sessions", (req, res) => {
    const id = Number(req.params.id);
    const student = getStudentById(id);
    if (!student) {
      res.status(404).json({ error: `No student found with id ${id}` });
      return;
    }
    const { session_date, note } = req.body ?? {};
    if (!session_date || !note) {
      res.status(400).json({ error: "session_date and note are required" });
      return;
    }
    const created = logSessionNote(id, session_date, note);
    res.status(201).json(created);
  });

  router.post("/students/:id/homework", (req, res) => {
    const id = Number(req.params.id);
    const student = getStudentById(id);
    if (!student) {
      res.status(404).json({ error: `No student found with id ${id}` });
      return;
    }
    const { description, due_date } = req.body ?? {};
    if (!description) {
      res.status(400).json({ error: "description is required" });
      return;
    }
    const created = assignHomework(id, description, due_date ?? null);
    res.status(201).json(created);
  });

  router.patch("/homework/:id", (req, res) => {
    const id = Number(req.params.id);
    const item = getHomeworkById(id);
    if (!item) {
      res.status(404).json({ error: `No homework item found with id ${id}` });
      return;
    }
    const { completed } = req.body ?? {};
    if (typeof completed !== "boolean") {
      res.status(400).json({ error: "completed (boolean) is required" });
      return;
    }
    res.json(setHomeworkCompleted(id, completed));
  });

  router.delete("/homework/:id", (req, res) => {
    const id = Number(req.params.id);
    const deleted = deleteHomeworkById(id);
    if (!deleted) {
      res.status(404).json({ error: `No homework item found with id ${id}` });
      return;
    }
    res.status(204).send();
  });

  router.post("/students/:id/progress-report/draft", async (req, res) => {
    const id = Number(req.params.id);
    const student = getStudentById(id);
    if (!student) {
      res.status(404).json({ error: `No student found with id ${id}` });
      return;
    }
    const sessions = listRecentSessions(id, 8);
    if (sessions.length === 0) {
      res.status(422).json({ error: "No logged sessions yet — nothing to summarize" });
      return;
    }

    try {
      const summary = await draftProgressReport(student, sessions);
      res.json({ summary });
    } catch {
      res.status(503).json({ error: "ANTHROPIC_API_KEY is not set on the server" });
    }
  });

  // Saves an exact summary text (from a prior /draft call) — does NOT call
  // the LLM again. Re-drafting on save would mean the text reviewed in the
  // UI isn't necessarily the text that gets stored, since an LLM call
  // isn't deterministic; this endpoint only ever persists what it's given.
  router.post("/students/:id/progress-report", (req, res) => {
    const id = Number(req.params.id);
    const student = getStudentById(id);
    if (!student) {
      res.status(404).json({ error: `No student found with id ${id}` });
      return;
    }
    const summary = req.body?.summary;
    if (typeof summary !== "string" || !summary.trim()) {
      res.status(400).json({ error: "summary (string) is required — draft one first via /draft" });
      return;
    }
    const saved = saveProgressReport(id, summary);
    res.status(201).json(saved);
  });

  return router;
}
