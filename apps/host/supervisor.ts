import { fork, type ChildProcess } from "node:child_process";
export type Component = "backend" | "discord" | "collector";
export type State = {
  status: string;
  retries: number;
  gameConnected?: boolean;
  queueDepth?: number;
};
export function restartDelay(attempt: number) {
  return Math.min(30000, 1000 * 2 ** attempt);
}
export class Supervisor {
  readonly states: Record<Component, State> = {
    backend: { status: "Gestoppt", retries: 0 },
    discord: { status: "Gestoppt", retries: 0 },
    collector: { status: "Gestoppt", retries: 0 },
  };
  private children = new Map<Component, ChildProcess>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopping = false;
  constructor(
    private worker: string,
    private env: NodeJS.ProcessEnv,
    private log: (component: string, message: string) => void,
    private changed: () => void,
    private spawn: typeof fork = fork,
  ) {}
  start(name: Component) {
    if (this.stopping || this.children.has(name)) return;
    const state = this.states[name];
    state.status = "Startet";
    this.changed();
    const child = this.spawn(this.worker, [name], {
      env: this.env,
      execArgv: [],
      silent: true,
      windowsHide: true,
    });
    this.children.set(name, child);
    // Discard arbitrary dependency output. Only typed, allowlisted IPC facts reach logs/UI.
    child.stdout?.resume();
    child.stderr?.resume();
    child.on("message", (input: unknown) => {
      if (!input || typeof input !== "object") return;
      const message = input as Record<string, unknown>;
      if (message.type === "ready") {
        state.status = "Online";
        this.log(name.toUpperCase(), "Komponente gestartet.");
      }
      if (
        message.type === "connection" &&
        typeof message.connected === "boolean"
      )
        state.status = message.connected
          ? "Verbunden"
          : "Verbindung unterbrochen";
      if (
        message.type === "collector" &&
        typeof message.gameConnected === "boolean" &&
        typeof message.queueDepth === "number"
      ) {
        state.gameConnected = message.gameConnected;
        state.queueDepth = message.queueDepth;
      }
      if (
        message.type === "diagnostic" &&
        typeof message.message === "string" &&
        name === "collector"
      )
        this.log("COLLECTOR", message.message);
      this.changed();
    });
    const exited = () => {
      if (this.children.get(name) !== child) return;
      this.children.delete(name);
      if (this.stopping) {
        state.status = "Gestoppt";
        this.changed();
        return;
      }
      if (state.retries >= 5) {
        state.status = "Fehler – Neustart erforderlich";
        this.log(name.toUpperCase(), "Neustartlimit erreicht.");
        this.changed();
        return;
      }
      const delay = restartDelay(state.retries++);
      state.status = `Neustart in ${delay / 1000}s`;
      this.log(name.toUpperCase(), state.status);
      this.changed();
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.start(name);
      }, delay);
      this.timers.add(timer);
    };
    child.once("exit", exited);
    child.once("error", exited);
  }
  async waitReady(name: Component, timeout = 45000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (["Online", "Verbunden"].includes(this.states[name].status)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Komponente startet nicht. Status und Logs prüfen.");
  }
  async stop() {
    this.stopping = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    // Writers stop before the backend/database.
    for (const name of ["collector", "discord", "backend"] as const) {
      const child = this.children.get(name);
      if (!child) continue;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.log(name.toUpperCase(), "Shutdown-Zeitlimit erreicht.");
          child.kill();
        }, 45000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        if (child.connected) child.send({ type: "stop" });
        else child.kill();
      });
    }
  }
}
