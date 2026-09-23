import { database, migrate } from "../packages/database/db.js";
import { Repository } from "../packages/database/repository.js";
import { action } from "../packages/shared/actions.js";
import { fixture, deliveries } from "../tests/fixtures.js";
import { randomUUID } from "node:crypto";
const guid = `simulation-${randomUUID()}`;
if (process.argv.includes("--send")) {
  if (!process.env.COLLECTOR_TOKEN)
    throw new Error(
      "COLLECTOR_TOKEN für expliziten Live-Simulatortest erforderlich.",
    );
  const r = await fetch(
    `${process.env.BACKEND_PUBLIC_URL ?? "http://localhost:3000"}/api/v1/collector/events`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.COLLECTOR_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        deliveries(fixture(guid), new Date(Date.now() - 600000).toISOString()),
      ),
    },
  );
  if (!r.ok) throw new Error(`Ingestion fehlgeschlagen: ${r.status}`);
  console.log(await r.json());
} else {
  const db = database("pglite:");
  try {
    await migrate(db);
    const repo = new Repository(db),
      guild = "100000",
      actor = { id: "100001", admin: true };
    await repo.setup(guild, actor.id);
    for (const [discordId, name] of [
      ["100001", "NiklasRL"],
      ["100002", "MaxRL"],
    ])
      await repo.addMember(guild, actor.id, {
        discordId,
        name,
        displayName: name,
        platform: "Epic",
      });
    const a = await repo.pair(
        (await repo.pairCode(guild, actor.id)).code,
        "PC 1",
      ),
      b = await repo.pair((await repo.pairCode(guild, actor.id)).code, "PC 2");
    const packets = deliveries(fixture(guid));
    await repo.ingest(guild, a.id, packets.slice(0, 6));
    await repo.ingest(guild, a.id, packets);
    await repo.ingest(guild, b.id, deliveries(fixture(guid)));
    const result = await action(repo, guild, actor, "stats.server");
    console.log(
      JSON.stringify(
        { scenario: "2 Mitglieder, 2 Collector, Reconnect, 1 Match", result },
        null,
        2,
      ),
    );
    const matches = await repo.matches(guild);
    if (
      matches.length !== 1 ||
      Object.keys(matches[0].state.players).length !== 2
    )
      throw new Error("Acceptance-Szenario fehlgeschlagen.");
    console.log(
      "Acceptance-Szenario erfolgreich. Keine produktiven Daten geschrieben.",
    );
  } finally {
    await db.close();
  }
}
