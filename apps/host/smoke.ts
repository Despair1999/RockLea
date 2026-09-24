import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startBackend } from "../backend/service.js";
import { saveConfig, loadConfig, newToken } from "./config.js";
const dir = mkdtempSync(join(tmpdir(), "rocklea-smoke-"));
saveConfig(dir, {
  discordToken: "synthetic-token-for-smoke",
  clientId: "123456789",
  clientSecret: "synthetic-client-secret",
  guildId: "123456789",
  internalToken: newToken(),
});
if (!loadConfig(dir) || !existsSync(join(dir, "config.dpapi")))
  throw new Error("DPAPI");
process.env.INTERNAL_TOKEN = newToken();
process.env.DATABASE_URL = `pglite:${join(dir, "backend")}`;
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
const backend = await startBackend();
const response = await fetch(backend.url + "/");
if (!response.ok || !(await response.text()).includes("RockLea"))
  throw new Error("Dashboard unavailable");
await backend.stop();
