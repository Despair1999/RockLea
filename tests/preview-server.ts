// Test-only browser harness. Never part of a production entry point or build.
import { database, migrate } from "../packages/database/db.js";
import { Repository } from "../packages/database/repository.js";
import { server } from "../apps/backend/server.js";
import { secret, hash } from "../packages/shared/crypto.js";
import { deliveries, fixture } from "./fixtures.js";
const db = database("pglite:");
await migrate(db);
const repo = new Repository(db),
  guild = "100000",
  actor = "100001";
await repo.setup(guild, actor);
for (const [discordId, name] of [
  [actor, "NiklasRL"],
  ["100002", "MaxRL"],
])
  await repo.addMember(guild, actor, {
    discordId,
    name,
    displayName: name,
    platform: "Epic",
  });
const collector = await repo.pair(
  (await repo.pairCode(guild, actor)).code,
  "Test-PC",
);
await repo.ingest(
  guild,
  collector.id,
  deliveries(fixture(), new Date(Date.now() - 3600000).toISOString()),
);
const app = await server(repo, {
  internalToken: secret(),
  publicUrl: "http://localhost:3011",
});
app.get("/test-session", async (_req, reply) => {
  const token = secret();
  await db.query(
    "INSERT INTO web_sessions(hash,user_id,guilds,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes')",
    [
      hash(token),
      actor,
      JSON.stringify([{ id: guild, name: "Isolierter Testserver" }]),
    ],
  );
  reply.setCookie("rl_session", token, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    maxAge: 900,
  });
  return reply.redirect("/");
});
await app.listen({ host: "127.0.0.1", port: 3011 });
console.log("Isolierter Browser-Test auf http://localhost:3011/test-session");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(
    signal,
    () =>
      void (async () => {
        await app.close();
        await db.close();
      })(),
  );
