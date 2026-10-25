import { bootstrapDatabase } from "./bootstrap.js";

const { seeded } = bootstrapDatabase({ seedIfEmpty: true });
console.log(
  seeded
    ? "Created tables and seeded 2 students with sample session + homework data."
    : "Tables ready. Database already has data, skipping seed."
);
