import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { saveConfig, loadConfig } from "../apps/host/config.js";
import { prepareData } from "../apps/host/prepare.js";
import { database } from "../packages/database/db.js";
import { Outbox } from "../apps/collector/outbox.js";
const [mode, appPath, dataPath] = process.argv.slice(2);
const dir = resolve(dataPath);
process.chdir(resolve(appPath)); // Migrations from the actual installed release.
if (mode === "seed") {
  const config = saveConfig(dir, {
    discordToken: "synthetic-upgrade-discord-token",
    clientId: "123456789",
    clientSecret: "synthetic-upgrade-client-secret",
    guildId: "987654321",
    internalToken: "synthetic-upgrade-internal-token-000000",
  });
  await prepareData(dir, config);
  const db = database(`pglite:${join(dir, "data/backend")}`);
  assert.equal(
    (
      await db.query(
        "SELECT name FROM schema_migrations WHERE name LIKE '005%'",
      )
    ).length,
    0,
  );
  await db.exec(
    "CREATE TABLE upgrade_probe(value text); INSERT INTO upgrade_probe VALUES ('historical-match-preserved')",
  );
  await db.close();
  const queue = new Outbox(join(dir, "outbox.sqlite"));
  queue.put({
    Event: "MatchCreated",
    Data: { MatchGuid: "pending-offline-match" },
  });
  queue.close();
  writeFileSync(join(dir, "data-version"), "0.2.0");
  console.log(
    "Seeded installed 0.2.0 schema with synthetic DPAPI config/pairing, history and offline queue.",
  );
} else {
  const before = readFileSync(join(dir, "credentials.dpapi")),
    configBytes = readFileSync(join(dir, "config.dpapi"));
  const config = loadConfig(dir)!;
  assert.equal(config.guildId, "987654321");
  await prepareData(dir, config);
  assert.deepEqual(readFileSync(join(dir, "credentials.dpapi")), before);
  assert.deepEqual(readFileSync(join(dir, "config.dpapi")), configBytes);
  const db = database(`pglite:${join(dir, "data/backend")}`);
  assert.deepEqual(await db.query("SELECT value FROM upgrade_probe"), [
    { value: "historical-match-preserved" },
  ]);
  assert.equal(
    (
      await db.query(
        "SELECT name FROM schema_migrations WHERE name LIKE '005%'",
      )
    ).length,
    1,
  );
  await db.close();
  const queue = new Outbox(join(dir, "outbox.sqlite"));
  assert.equal(queue.batch()[0].event.Data.MatchGuid, "pending-offline-match");
  queue.close();
  console.log(
    "0.2.0 → 0.3.0: DPAPI configuration, pairing, database history and offline queue preserved; migration 005 applied.",
  );
}
