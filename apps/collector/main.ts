import {
  mkdirSync,
  existsSync,
  writeFileSync,
  appendFileSync,
  statSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hostname } from "node:os";
import { z } from "zod";
import { startCollector } from "./service.js";
import { findInstallations, configure, protect, autostart } from "./windows.js";
const dir = join(process.env.LOCALAPPDATA ?? process.cwd(), "RockLea");
mkdirSync(dir, { recursive: true });
const credentials = join(dir, "credentials.dpapi");
const logPath = join(dir, "collector.log");
function log(message: string) {
  const line = JSON.stringify({ time: new Date().toISOString(), message });
  console.log(message);
  try {
    if (existsSync(logPath) && statSync(logPath).size > 2_000_000)
      renameSync(logPath, `${logPath}.1`);
    appendFileSync(logPath, line + "\n");
  } catch {
    console.warn(
      "Logdatei konnte nicht geschrieben werden; Datenträger prüfen.",
    );
  }
}
function backendUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" &&
    !(
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    )
  )
    throw new Error("Backend benötigt HTTPS (außer localhost).");
  return u.origin;
}
async function main() {
  if (process.argv.includes("--version")) {
    console.log("RLStatsCollector 0.2.0");
    return;
  }
  if (process.argv.includes("--configure")) {
    const found = findInstallations();
    if (!found.length)
      throw new Error(
        "Keine Rocket-League-Installation gefunden. Siehe docs/INSTALLATION.md.",
      );
    const rateIndex = process.argv.indexOf("--packet-rate");
    const rate = rateIndex < 0 ? 10 : Number(process.argv[rateIndex + 1]);
    for (const file of found) configure(file, rate);
    return;
  }
  if (process.argv.includes("--autostart")) {
    autostart(process.execPath, true);
    return;
  }
  if (process.argv.includes("--no-autostart")) {
    autostart(process.execPath, false);
    return;
  }
  if (process.argv.includes("--setup") || !existsSync(credentials)) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const backend = backendUrl(
        await rl.question("Backend-URL (https://…): "),
      );
      const code = (
        await rl.question("Pairing-Code aus /collector pair: ")
      ).trim();
      const response = await fetch(`${backend}/api/v1/collector/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name: hostname() }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("Pairing fehlgeschlagen. Code und Backend prüfen.");
      const pair = z
        .object({ id: z.string(), token: z.string(), guildId: z.string() })
        .parse(await response.json());
      writeFileSync(
        credentials,
        protect(JSON.stringify({ backend, ...pair }), true),
      );
      for (const path of findInstallations()) configure(path);
      if (process.execPath.toLowerCase().endsWith("rlstatscollector.exe"))
        autostart(process.execPath, true);
      log("Collector erfolgreich verbunden.");
    } finally {
      rl.close();
    }
  }
  const collector = await startCollector(dir, log);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => void collector.stop());
}
void main().catch(() => {
  log(
    "Collector konnte nicht gestartet werden. Konfiguration, Berechtigungen und Pairing prüfen.",
  );
  process.exitCode = 1;
});
