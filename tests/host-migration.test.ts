import { it, expect, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { hostConfig, newToken } from "../apps/host/config.js";
import { prepareData } from "../apps/host/prepare.js";
import { importLegacy } from "../apps/host/migration.js";
import { startCollector } from "../apps/collector/service.js";
import { startBackend } from "../apps/backend/service.js";
import { database } from "../packages/database/db.js";
import { Outbox } from "../apps/collector/outbox.js";
it.runIf(process.platform === "win32")(
  "migrates a real database, preserves DPAPI pairing/outbox and starts collector against the integrated backend",
  async () => {
    const socket = createServer();
    await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((r) => socket.close(() => r()));
    const source = mkdtempSync(join(tmpdir(), "rocklea-legacy-")),
      target = mkdtempSync(join(tmpdir(), "rocklea-upgrade-"));
    const config = hostConfig.parse({
      discordToken: "synthetic-discord-token",
      clientId: "123456789",
      clientSecret: "synthetic-client-secret",
      guildId: "987654321",
      internalToken: newToken(),
      port,
    });
    await prepareData(source, config);
    let db = database(`pglite:${join(source, "data", "backend")}`);
    await db.exec(
      "CREATE TABLE migration_probe (value text); INSERT INTO migration_probe VALUES ('preserve-match-history')",
    );
    await db.close();
    const queue = new Outbox(join(target, "outbox.sqlite"));
    queue.put({
      Event: "MatchCreated",
      Data: { MatchGuid: "preserved-queued-match" },
    });
    queue.close();
    copyFileSync(
      join(source, "credentials.dpapi"),
      join(target, "credentials.dpapi"),
    );
    const credentials = readFileSync(join(target, "credentials.dpapi"));
    writeFileSync(
      join(source, ".env"),
      `DISCORD_TOKEN=${config.discordToken}\nDISCORD_CLIENT_ID=${config.clientId}\nDISCORD_CLIENT_SECRET=${config.clientSecret}\nDISCORD_GUILD_ID=${config.guildId}\nINTERNAL_TOKEN=${config.internalToken}\nPORT=${port}\nDATABASE_URL=pglite:data/backend\n`,
    );
    importLegacy(source, target);
    await prepareData(target, config);
    expect(readFileSync(join(target, "credentials.dpapi"))).toEqual(
      credentials,
    );
    const preserved = new Outbox(join(target, "outbox.sqlite"));
    expect(preserved.depth()).toBe(1);
    preserved.close();
    db = database(`pglite:${join(target, "data", "backend")}`);
    expect(await db.query("SELECT value FROM migration_probe")).toEqual([
      { value: "preserve-match-history" },
    ]);
    await db.close();
    vi.stubEnv("DATABASE_URL", `pglite:${join(target, "data", "backend")}`);
    vi.stubEnv("INTERNAL_TOKEN", config.internalToken);
    vi.stubEnv("PORT", String(port));
    vi.stubEnv("HOST", "127.0.0.1");
    const backend = await startBackend();
    let collector: Awaited<ReturnType<typeof startCollector>> | undefined;
    try {
      const statuses: unknown[] = [];
      collector = await startCollector(
        target,
        () => {},
        (s) => statuses.push(s),
      );
      await new Promise((r) => setTimeout(r, 400));
      expect(statuses.length).toBeGreaterThan(0);
      expect((await fetch(backend.url + "/api/v1/me")).status).toBe(401);
    } finally {
      await collector?.stop();
      await backend.stop();
      vi.unstubAllEnvs();
    }
  },
  20000,
);
