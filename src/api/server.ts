import "dotenv/config";
import express from "express";
import cors from "cors";
import { listStudents, getStudentById } from "../services/students.js";
import { listRecentSessions, logSessionNote } from "../services/sessions.js";
import {
  listOpenHomework,
  getHomeworkById,
  assignHomework,
  deleteHomeworkById,
  setHomeworkCompleted,
} from "../services/homework.js";
import {
  draftProgressReport,
  saveProgressReport,
  listProgressReports,
} from "../services/progressReports.js";

/**
 * REST API for the Angular dashboard. Built on the exact same services and
 * SQLite database as the MCP tools (see src/services/*.ts) — this is the
 * "human via UI" interface onto the same data the "AI agent via MCP"
 * interface uses. Neither one is the source of truth for the other; the DB
 * is, and both interfaces sit on top of it.
 *
 * Note on write semantics: the MCP write tools use a preview-then-confirm
 * round trip because an agent might otherwise act on ambiguous instructions
 * unsupervised. Here, a human clicking a UI button (with the browser-side
 * confirm dialog Angular will show before a delete) serves the same
 * purpose, so these routes just perform the action directly.
 */

const PORT = process.env.API_PORT ?? 3001;
const app = express();
app.use(express.json());
app.use(cors());

app.get("/api/students", (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  res.json(listStudents(search));
});

app.get("/api/students/:id", (req, res) => {
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

app.post("/api/students/:id/sessions", (req, res) => {
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

app.post("/api/students/:id/homework", (req, res) => {
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

app.patch("/api/homework/:id", (req, res) => {
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

app.delete("/api/homework/:id", (req, res) => {
  const id = Number(req.params.id);
  const deleted = deleteHomeworkById(id);
  if (!deleted) {
    res.status(404).json({ error: `No homework item found with id ${id}` });
    return;
  }
  res.status(204).send();
});

app.post("/api/students/:id/progress-report", async (req, res) => {
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

  let summary: string;
  try {
    summary = await draftProgressReport(student, sessions);
  } catch {
    res.status(503).json({ error: "ANTHROPIC_API_KEY is not set on the server" });
    return;
  }

  const save = req.body?.save === true;
  if (save) {
    const saved = saveProgressReport(id, summary);
    res.status(201).json(saved);
    return;
  }
  res.json({ summary, saved: false });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.error(`tutorflow REST API listening on port ${PORT}`);
});
