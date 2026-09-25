import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Outbox, backoff, flush } from "./outbox.js";
import { protect } from "./windows.js";
import { receive } from "./receive.js";
import { Heartbeat, type CollectorStatus } from "./heartbeat.js";
import {
  diagnosticLogger,
  formatIssue,
} from "../../packages/rocket-league-api/diagnostics.js";
import { CollectorStream } from "./stream.js";
import { type Member } from "../../packages/shared/model.js";
export async function startCollector(
  dir: string,
  log: (message: string) => void = console.log,
  status: (value: CollectorStatus) => void = () => {},
) {
  const credentials = join(dir, "credentials.dpapi");
  const config = z
    .object({
      backend: z.string(),
      id: z.string(),
      token: z.string(),
      guildId: z.string(),
    })
    .parse(JSON.parse(protect(readFileSync(credentials, "utf8"), false)));
  const backend = new URL(config.backend);
  if (
    backend.protocol !== "https:" &&
    !(
      backend.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname)
    )
  )
    throw new Error("Unsichere Backend-URL");
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
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      controller.signal.addEventListener("abort", done, { once: true });
      if (controller.signal.aborted) done();
    });
  async function request(path: string, body?: unknown) {
    const response = await fetch(`${config.backend}/api/v1/collector/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
    return response.json();
  }
  const heartbeat = new Heartbeat(
    () => {
      const current = {
        gameConnected: socket?.readyState === WebSocket.OPEN,
        queueDepth: queue.depth(),
        version: "0.3.0",
      };
      status(current);
      return current;
    },
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
      if (!stopping) reconnect = setTimeout(connect, 5000);
    });
  }
  connect();
  const stop = () => {
    stopping = true;
    clearInterval(heartbeatTimer);
    clearTimeout(reconnect);
    controller.abort();
    socket?.terminate();
  };

  const running = (async () => {
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
        if (attempt)
          log("Backend wieder verbunden; Puffer wird synchronisiert.");
        attempt = 0;
        await sleep(queue.depth() ? 100 : 1000);
      } catch {
        if (!attempt)
          log(
            "Backend nicht erreichbar. Daten bleiben lokal gepuffert; neuer Verbindungsversuch folgt.",
          );
        await sleep(backoff(attempt++));
      }
    }
    queue.close();
  })();
  return {
    stop: async () => {
      stop();
      await running;
    },
  };
}
