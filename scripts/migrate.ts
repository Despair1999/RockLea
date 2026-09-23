import { database, migrate } from "../packages/database/db.js";
const db = database(process.env.DATABASE_URL ?? "pglite:data/backend");
try {
  await migrate(db);
  console.log("Migrationen erfolgreich.");
} finally {
  await db.close();
}
