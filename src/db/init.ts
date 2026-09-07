import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function main() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);

  const count = db.prepare("SELECT COUNT(*) as n FROM students").get() as { n: number };
  if (count.n === 0) {
    const insertStudent = db.prepare(
      "INSERT INTO students (name, grade, subject_focus, parent_email) VALUES (?, ?, ?, ?)"
    );
    const { lastInsertRowid: aidenId } = insertStudent.run(
      "Aiden P.",
      "Grade 3",
      "Writing & reading comprehension",
      "parent1@example.com"
    );
    const { lastInsertRowid: miaId } = insertStudent.run(
      "Mia T.",
      "Grade 5",
      "Essay structure",
      "parent2@example.com"
    );

    db.prepare(
      "INSERT INTO sessions (student_id, session_date, note) VALUES (?, ?, ?)"
    ).run(
      aidenId,
      "2026-08-25",
      "Worked on paragraph structure. Still mixing up 'their/there'. Confident with reading aloud."
    );

    db.prepare(
      "INSERT INTO homework_items (student_id, description, due_date) VALUES (?, ?, ?)"
    ).run(aidenId, "Write 5 sentences using 'their' and 'there' correctly", "2026-09-05");

    console.log("Seeded 2 students with sample session + homework data.");
  } else {
    console.log("Database already has data, skipping seed.");
  }
}

main();
