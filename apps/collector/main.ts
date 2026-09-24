import WebSocket from "ws";
import {
  mkdirSync,
  existsSync,
  readFileSync,
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
import { Outbox, backoff, flush } from "./outbox.js";
import { findInstallations, configure, protect, autostart } from "./windows.js";
import { receive } from "./receive.js";
import { Heartbeat } from "./heartbeat.js";
import {
  diagnosticLogger,
  formatIssue,
} from "../../packages/rocket-league-api/diagnostics.js";
import { CollectorStream } from "./stream.js";
import { type Member } from "../../packages/shared/model.js";
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
    console.log("RLStatsCollector 0.1.1");
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
  const config = z
    .object({
      backend: z.string(),
      id: z.string(),
      token: z.string(),
      guildId: z.string(),
    })
    .parse(JSON.parse(protect(readFileSync(credentials, "utf8"), false)));
  backendUrl(config.backend);
  const queue = new Outbox(join(dir, "outbox.sqlite"));
  let members = queue.get<Member[]>("roster") ?? [];
  const report = diagnosticLogger(log);
  const makeStream = () =>
    new CollectorStream((issue) => report(formatIssue(issue)));
  let stream = makeStream();
  let stopping = false,
    attempt = 0,
    lastRoster = 0;
  let socket: WebSocket | undefined;
  async function request(path: string, body?: unknown) {
    const response = await fetch(`${config.backend}/api/v1/collector/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
    return response.json();
  }
  const heartbeat = new Heartbeat(
    () => ({
      gameConnected: socket?.readyState === WebSocket.OPEN,
      queueDepth: queue.depth(),
      version: "0.1.1",
    }),
    (status) => request("heartbeat", status),
    () => report("Heartbeat fehlgeschlagen; neuer Versuch folgt."),
  );
  const heartbeatTimer = setInterval(() => void heartbeat.tick(), 5000);
  void heartbeat.tick();
  function connect() {
    if (stopping) return;
    socket = new WebSocket("ws://127.0.0.1:49124", {
      maxPayload: 1024 * 1024,
      handshakeTimeout: 5000,
    });
    socket.on("open", () => {
      stream = makeStream();
      void heartbeat.tick();
      log("Rocket League Stats API verbunden.");
    });
    socket.on("message", (raw) => {
      receive(
        raw.toString(),
        stream,
        members,
        (event) => queue.put(event),
        report,
      );
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      void heartbeat.tick();
      if (!stopping) setTimeout(connect, 5000);
    });
  }
  connect();
  const stop = () => {
    stopping = true;
    clearInterval(heartbeatTimer);
    socket?.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  while (!stopping) {
    try {
      if (Date.now() - lastRoster > 60000) {
        members = (await request("roster")) as Member[];
        queue.set("roster", members);
        lastRoster = Date.now();
      }
      await flush(queue, async (batch) =>
        z
          .object({ accepted: z.array(z.string()) })
          .parse(await request("events", batch)),
      );
      if (attempt) log("Backend wieder verbunden; Puffer wird synchronisiert.");
      attempt = 0;
      await new Promise((r) => setTimeout(r, queue.depth() ? 100 : 1000));
    } catch {
      if (!attempt)
        log(
          "Backend nicht erreichbar. Daten bleiben lokal gepuffert; neuer Verbindungsversuch folgt.",
        );
      await new Promise((r) => setTimeout(r, backoff(attempt++)));
    }
  }
  queue.close();
}
void main().catch(() => {
  log(
    "Collector konnte nicht gestartet werden. Konfiguration, Berechtigungen und Pairing prüfen.",
  );
  process.exitCode = 1;
});
