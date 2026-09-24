import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import {
  saveConfig,
  loadConfig,
  newToken,
  componentEnvironment,
} from "./config.js";
import { prepareData } from "./prepare.js";
import { Supervisor } from "./supervisor.js";
const dir = mkdtempSync(join(tmpdir(), "rocklea-smoke-"));
const reservation = createServer();
await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
const port = (reservation.address() as { port: number }).port;
await new Promise<void>((r) => reservation.close(() => r()));
const config = saveConfig(dir, {
  discordToken: "synthetic-token-for-smoke",
  clientId: "123456789",
  clientSecret: "synthetic-client-secret",
  guildId: "123456789",
  internalToken: newToken(),
  port,
});
if (!loadConfig(dir)) throw new Error("DPAPI");
await prepareData(dir, config);
const host = new Supervisor(
  join(dirname(fileURLToPath(import.meta.url)), "worker.js"),
  componentEnvironment(config, dir),
  () => {},
  () => {},
);
try {
  host.start("backend");
  await host.waitReady("backend");
  const response = await fetch(`http://127.0.0.1:${port}/`);
  if (!response.ok || !(await response.text()).includes("RockLea"))
    throw new Error("Dashboard unavailable");
  host.start("collector");
  await host.waitReady("collector");
  // No synthetic Discord account is contacted. Bot lifecycle is covered with controlled supervisor tests.
} finally {
  await host.stop();
}
