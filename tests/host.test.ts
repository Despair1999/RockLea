import { describe, it, expect, vi, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { EventEmitter } from "node:events";
import { fork, type ChildProcess } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  hostConfig,
  loadConfig,
  saveConfig,
  componentEnvironment,
  newToken,
} from "../apps/host/config.js";
import { importLegacy } from "../apps/host/migration.js";
import { availablePort, instanceLock } from "../apps/host/lock.js";
import { Supervisor, restartDelay } from "../apps/host/supervisor.js";
import {
  newer,
  manifestHash,
  checkUpdate,
  stageUpdate,
} from "../apps/host/update.js";
import {
  collectorStatus,
  CollectorList,
} from "../apps/dashboard/collectors.js";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { startBackend } from "../apps/backend/service.js";
const config = hostConfig.parse({
  discordToken: "synthetic-discord-token",
  clientId: "123456789",
  clientSecret: "synthetic-client-secret",
  guildId: "987654321",
  internalToken: newToken(),
});
const temp = () => mkdtempSync(join(tmpdir(), "rocklea-test-"));
const key = randomBytes(32),
  iv = randomBytes(16);
const crypto = (value: string, encrypt: boolean) => {
  const cipher = encrypt
    ? createCipheriv("aes-256-cbc", key, iv)
    : createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([
    cipher.update(Buffer.from(value, encrypt ? "utf8" : "base64")),
    cipher.final(),
  ]).toString(encrypt ? "base64" : "utf8");
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("desktop configuration and migration", () => {
  it("encrypts secrets, reloads settings and creates unpredictable internal tokens", () => {
    const dir = temp();
    saveConfig(dir, config, crypto);
    expect(readFileSync(join(dir, "config.dpapi"), "utf8")).not.toContain(
      config.discordToken,
    );
    expect(loadConfig(dir, crypto)).toEqual(config);
    expect(newToken()).not.toBe(newToken());
    expect(newToken()).toHaveLength(64);
  });
  it.runIf(process.platform === "win32")(
    "uses actual Windows DPAPI",
    () => {
      const dir = temp();
      saveConfig(dir, config);
      expect(loadConfig(dir)).toEqual(config);
      expect(readFileSync(join(dir, "config.dpapi"), "utf8")).not.toContain(
        config.clientSecret,
      );
    },
    15000,
  );
  it("does not replace existing encrypted config on invalid input", () => {
    const dir = temp();
    saveConfig(dir, config, crypto);
    expect(() => saveConfig(dir, { ...config, port: 1 }, crypto)).toThrow();
    expect(loadConfig(dir, crypto)).toEqual(config);
  });
  it("isolates desktop data from the installation path and development overrides", () => {
    vi.stubEnv("DATABASE_URL", "pglite:wrong");
    vi.stubEnv("DISCORD_TOKEN", "wrong");
    const env = componentEnvironment(config, "C:/data");
    expect(env.DISCORD_TOKEN).toBe(config.discordToken);
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.DATABASE_URL).toContain("backend");
    expect(env.DATABASE_URL).not.toContain("wrong");
  });
  it("imports legacy data without changing credentials, outbox or originals", () => {
    const dir = temp(),
      source = temp();
    mkdirSync(join(source, "data", "backend"), { recursive: true });
    writeFileSync(join(source, "data", "backend", "sentinel"), "match-history");
    writeFileSync(
      join(source, ".env"),
      `DISCORD_TOKEN=${config.discordToken}\nDISCORD_CLIENT_ID=${config.clientId}\nDISCORD_CLIENT_SECRET=${config.clientSecret}\nDISCORD_GUILD_ID=${config.guildId}\nDATABASE_URL=pglite:data/backend\n`,
    );
    writeFileSync(join(dir, "credentials.dpapi"), "existing-encrypted-pair");
    writeFileSync(join(dir, "outbox.sqlite"), "existing-offline-events");
    importLegacy(source, dir, crypto);
    expect(loadConfig(dir, crypto)?.guildId).toBe(config.guildId);
    expect(readFileSync(join(dir, "data", "backend", "sentinel"), "utf8")).toBe(
      "match-history",
    );
    expect(readFileSync(join(dir, "credentials.dpapi"), "utf8")).toBe(
      "existing-encrypted-pair",
    );
    expect(readFileSync(join(dir, "outbox.sqlite"), "utf8")).toBe(
      "existing-offline-events",
    );
    expect(existsSync(join(source, ".env"))).toBe(true);
    expect(() => importLegacy(source, dir, crypto)).toThrow();
  });
});
describe("desktop lifecycle", () => {
  it("prevents duplicate instances and releases the OS lock", async () => {
    const dir = temp();
    const unlock = await instanceLock(dir);
    await expect(instanceLock(dir)).rejects.toThrow("bereits");
    await unlock();
    await (
      await instanceLock(dir)
    )();
  });
  it("reports occupied ports without opening a database", async () => {
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    await expect(availablePort(port)).rejects.toThrow("belegt");
    await new Promise<void>((r) => server.close(() => r()));
    await expect(availablePort(port)).resolves.toBeUndefined();
  });
  it("starts an actual backend and releases its port/database on shutdown", async () => {
    const dir = temp();
    vi.stubEnv("DATABASE_URL", `pglite:${join(dir, "backend")}`);
    vi.stubEnv("INTERNAL_TOKEN", newToken());
    vi.stubEnv("PORT", "0");
    vi.stubEnv("HOST", "127.0.0.1");
    const backend = await startBackend();
    await backend.stop();
    const next = await startBackend();
    await next.stop();
  }, 30000);
  it("starts all services and stops writers before database", async () => {
    const order: string[] = [];
    const children: ChildProcess[] = [];
    const fake = ((_file: string, args: string[]) => {
      const child = new EventEmitter() as ChildProcess;
      Object.assign(child, {
        connected: true,
        send: () => {
          order.push(args[0]);
          queueMicrotask(() => child.emit("exit", 0));
        },
        kill: () => child.emit("exit", 0),
      });
      children.push(child);
      return child;
    }) as typeof fork;
    const host = new Supervisor(
      "worker",
      {},
      () => {},
      () => {},
      fake,
    );
    host.start("backend");
    host.start("discord");
    host.start("collector");
    for (const child of children) child.emit("message", { type: "ready" });
    expect(host.states.backend.status).toBe("Online");
    await host.stop();
    expect(order).toEqual(["collector", "discord", "backend"]);
  });
  it("bounds repeated crashes to five backoff restarts", async () => {
    vi.useFakeTimers();
    const children: ChildProcess[] = [];
    const fake = (() => {
      const child = new EventEmitter() as ChildProcess;
      children.push(child);
      return child;
    }) as typeof fork;
    const host = new Supervisor(
      "worker",
      {},
      () => {},
      () => {},
      fake,
    );
    host.start("backend");
    for (let i = 0; i < 6; i++) {
      children.at(-1)!.emit("exit", 1);
      await vi.runAllTimersAsync();
    }
    expect(children).toHaveLength(6);
    expect(host.states.backend.status).toContain("Neustart erforderlich");
    expect(restartDelay(20)).toBe(30000);
    await host.stop();
  });
});
describe("updates and collector view", () => {
  it.each([
    ["0.3.2", true],
    ["v0.10.0", true],
    ["0.2.0", false],
    ["0.1.99", false],
    ["bad", false],
    ["0.3.0-beta", false],
  ])("compares stable release %s", (version, expected) =>
    expect(newer(version as string)).toBe(expected),
  );
  it("requires one exact installer hash entry", () => {
    const hash = "a".repeat(64);
    expect(
      manifestHash(`${hash}  RockLea-Setup.exe`, "RockLea-Setup.exe"),
    ).toBe(hash);
    expect(() =>
      manifestHash(`${hash}  ../RockLea-Setup.exe`, "RockLea-Setup.exe"),
    ).toThrow();
    expect(() =>
      manifestHash(
        `${hash}  RockLea-Setup.exe\n${hash}  RockLea-Setup.exe`,
        "RockLea-Setup.exe",
      ),
    ).toThrow();
  });
  it("caches failed update checks for a day", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const dir = temp();
    await expect(checkUpdate(dir, "")).rejects.toThrow();
    expect(await checkUpdate(dir, "")).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects external release asset URLs before disclosing credentials", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      stageUpdate(
        temp(),
        {
          tag_name: "v0.3.2",
          draft: false,
          prerelease: false,
          assets: [
            { name: "RockLea-Setup.exe", url: "https://evil.test/1", size: 1 },
            { name: "SHA256SUMS.txt", url: "https://evil.test/2", size: 1 },
          ],
        },
        "private-token",
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a modified installer and preserves unrelated data", async () => {
    const dir = temp();
    writeFileSync(join(dir, "outbox.sqlite"), "keep");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("0".repeat(64) + "  RockLea-Setup.exe"),
      )
      .mockResolvedValueOnce(new Response("modified"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      stageUpdate(
        dir,
        {
          tag_name: "v0.3.2",
          draft: false,
          prerelease: false,
          assets: [
            {
              name: "RockLea-Setup.exe",
              url: "https://api.github.com/repos/Despair1999/RockLea/releases/assets/1",
              size: 8,
            },
            {
              name: "SHA256SUMS.txt",
              url: "https://api.github.com/repos/Despair1999/RockLea/releases/assets/2",
              size: 100,
            },
          ],
        },
        "",
      ),
    ).rejects.toThrow("SHA256");
    expect(existsSync(join(dir, "updates", "RockLea-Setup.exe"))).toBe(false);
    expect(readFileSync(join(dir, "outbox.sqlite"), "utf8")).toBe("keep");
  });
  it("renders collectors with status and row actions, without asking for UUIDs", () => {
    const row = {
      id: "synthetic-id",
      name: "Gaming PC",
      revoked: false,
      last_seen_at: new Date().toISOString(),
      owner_name: "Member",
      status: { version: "0.2.0", gameConnected: true, queueDepth: 4 },
    };
    expect(collectorStatus(row)).toBe("Online");
    expect(collectorStatus({ ...row, revoked: true })).toContain("widerrufen");
    const html = renderToStaticMarkup(
      React.createElement(CollectorList, {
        data: [row],
        busy: false,
        mutate: async () => {},
      }),
    );
    expect(html).toContain("Gaming PC");
    expect(html).toContain("Umbenennen");
    expect(html).toContain("Member");
    expect(html).not.toContain("Collector-ID");
  });
});
