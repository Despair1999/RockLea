import { database } from "../../packages/database/db.js";
import { Repository } from "../../packages/database/repository.js";
import { server } from "./server.js";
import { reconcile } from "../../packages/stats-engine/reconcile.js";
const internalToken = process.env.INTERNAL_TOKEN;
if (!internalToken || internalToken.length < 32)
  throw new Error(
    "INTERNAL_TOKEN muss mindestens 32 Zeichen lang sein. Siehe .env.example.",
  );
const db = database(process.env.DATABASE_URL ?? "pglite:data/backend");
const app = await server(new Repository(db), {
  internalToken,
  publicUrl: process.env.BACKEND_PUBLIC_URL ?? "http://localhost:3000",
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  production: process.env.NODE_ENV === "production",
  logger: true,
});
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
});
const cleanup = setInterval(
  () =>
    void db
      .transaction(async (q) => {
        await q.query("DELETE FROM web_sessions WHERE expires_at<now()");
        await q.query("DELETE FROM pairing_codes WHERE expires_at<now()");
        await q.query(
          "DELETE FROM receipts WHERE received_at<now()-interval '90 days'",
        );
      })
      .catch(() => app.log.warn("Bereinigung fehlgeschlagen.")),
  3600000,
);
let reconciling = false;
const maintenance = setInterval(() => {
  if (reconciling) return;
  reconciling = true;
  void reconcile(db)
    .catch(() => app.log.warn("Statistik-Abgleich fehlgeschlagen."))
    .finally(() => {
      reconciling = false;
    });
}, 30000);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(
    signal,
    () =>
      void (async () => {
        clearInterval(cleanup);
        clearInterval(maintenance);
        await app.close();
        await db.close();
      })(),
  );
