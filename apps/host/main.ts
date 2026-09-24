import { HostError, hostErrorMessage } from "./errors.js";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  VERSION,
  loadConfig,
  saveConfig,
  newToken,
  hostConfig,
  componentEnvironment,
  validateDiscord,
  type HostConfig,
} from "./config.js";
import { Supervisor } from "./supervisor.js";
import { rotatingLog } from "./log.js";
import { availablePort, instanceLock } from "./lock.js";
import { prepareData } from "./prepare.js";
import { importLegacy, backup } from "./migration.js";
import { findInstallations, configure } from "../collector/windows.js";
import { checkUpdate, stageUpdate, newer, type Release } from "./update.js";
const dir =
  process.env.ROCKLEA_DATA_DIR ||
  join(process.env.LOCALAPPDATA || process.cwd(), "RockLea");
mkdirSync(dir, { recursive: true });
const log = rotatingLog(dir);
const send = (value: unknown) =>
  process.stdout.write(JSON.stringify(value) + "\n");
let config: HostConfig | undefined,
  supervisor: Supervisor | undefined,
  release: Release | undefined;
let quitting = false;
let releaseLock: (() => Promise<void>) | undefined;
function state() {
  send({
    type: "state",
    version: VERSION,
    configured: !!config,
    port: config?.port ?? 3000,
    autostart:
      process.platform === "win32" &&
      spawnSync(
        "reg.exe",
        [
          "query",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
          "/v",
          "RockLea",
        ],
        { windowsHide: true, stdio: "ignore" },
      ).status === 0,
    components: supervisor?.states ?? {},
    paired: existsSync(join(dir, "credentials.dpapi")),
    outbox: existsSync(join(dir, "outbox.sqlite")),
    update: release && newer(release.tag_name) ? release.tag_name : "",
  });
}
function message(text: string) {
  send({ type: "notice", message: text });
}
function setAutostart(enable: boolean) {
  const executable = join(
    process.env.ROCKLEA_INSTALL_DIR || process.cwd(),
    "RockLea.exe",
  );
  const args = enable
    ? [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        "/v",
        "RockLea",
        "/t",
        "REG_SZ",
        "/d",
        `"${executable}" --tray`,
        "/f",
      ]
    : [
        "delete",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        "/v",
        "RockLea",
        "/f",
      ];
  const result = spawnSync("reg.exe", args, {
    windowsHide: true,
    stdio: "ignore",
  });
  if (enable && result.status !== 0)
    throw new Error("Autostart konnte nicht gesetzt werden.");
  // Superseded legacy entry must not launch a second writer against the same outbox.
  spawnSync(
    "reg.exe",
    [
      "delete",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      "/v",
      "RockLeaCollector",
      "/f",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
}
async function stop() {
  await supervisor?.stop();
  supervisor = undefined;
  state();
}
async function start() {
  if (!config) return;
  await availablePort(config.port);
  await prepareData(dir, config);
  supervisor = new Supervisor(
    join(dirname(fileURLToPath(import.meta.url)), "worker.js"),
    componentEnvironment(config, dir),
    log,
    state,
  );
  supervisor.start("backend");
  await supervisor.waitReady("backend");
  supervisor.start("discord");
  supervisor.start("collector");
  state();
}
async function quit() {
  if (quitting) return;
  quitting = true;
  await stop();
  await releaseLock?.();
  process.exit(0);
}
async function updates(force: boolean) {
  release = await checkUpdate(dir, config?.githubToken ?? "", force);
  state();
  if (force)
    message(
      release && newer(release.tag_name)
        ? "Neue Version verfügbar. Aktualisieren startet die geprüfte Installation."
        : "Keine neuere Version verfügbar.",
    );
}
async function command(input: unknown) {
  if (!input || typeof input !== "object") return;
  const value = input as Record<string, unknown>;
  if (value.command === "quit") return quit();
  if (value.command === "status") return state();
  if (value.command === "configure") {
    const fields =
      typeof value.config === "object" && value.config ? value.config : {};
    const next = hostConfig.parse({
      ...config,
      ...fields,
      internalToken: config?.internalToken ?? newToken(),
    });
    await validateDiscord(next);
    await stop();
    await availablePort(next.port);
    if (
      existsSync(join(dir, "credentials.dpapi")) &&
      !existsSync(join(dir, "data", "backend"))
    )
      throw new HostError(
        "Vorhandenes Pairing erkannt: zuerst die alte Datenbank importieren.",
      );
    config = saveConfig(dir, next);
    try {
      for (const file of findInstallations()) configure(file);
    } catch {
      message(
        "Stats API konnte nicht automatisch eingerichtet werden. Installationshilfe prüfen.",
      );
    }
    setAutostart(config.autostart);
    await start();
    message(
      "Konfiguration gespeichert. Discord-Server im Dashboard einrichten.",
    );
  }
  if (value.command === "settings")
    send({
      type: "settings",
      clientId: config?.clientId ?? "",
      guildId: config?.guildId ?? "",
      port: config?.port ?? 3000,
      autostart:
        process.platform === "win32" &&
        spawnSync(
          "reg.exe",
          [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v",
            "RockLea",
          ],
          { windowsHide: true, stdio: "ignore" },
        ).status === 0,
    });
  if (value.command === "import" && typeof value.path === "string") {
    if (config)
      throw new HostError(
        "Eine Konfiguration existiert bereits. Import würde vorhandene Daten überschreiben.",
      );
    await availablePort(3000);
    config = importLegacy(value.path, dir);
    setAutostart(config.autostart);
    await start();
    message("Import abgeschlossen. Originaldateien sind unverändert.");
  }
  if (value.command === "restart") {
    await stop();
    await start();
  }
  if (value.command === "backup") {
    await stop();
    backup(dir);
    await start();
    message("Backup im lokalen RockLea-Backupordner erstellt.");
  }
  if (value.command === "autostart" && config) {
    setAutostart(value.enabled === true);
    config = saveConfig(dir, { ...config, autostart: value.enabled === true });
    state();
  }
  if (value.command === "game-setup") {
    const files = findInstallations();
    for (const file of files) configure(file);
    message(
      files.length
        ? "Stats API eingerichtet. Rocket League neu starten."
        : "Keine Installation erkannt. Siehe Installationshilfe.",
    );
  }
  if (value.command === "check-update") await updates(true);
  if (value.command === "update" && release) {
    const installer = await stageUpdate(
      dir,
      release,
      config?.githubToken ?? "",
    );
    await stop();
    send({ type: "install", path: installer });
  }
}
// stdout is a typed private pipe to the native window; third-party logging is discarded.
console.log = () => {};
console.warn = () => {};
console.error = () => {};
const lines = createInterface({ input: process.stdin });
let finishStartup: () => void = () => {};
let pending = new Promise<void>((resolve) => {
  finishStartup = resolve;
});
lines.on("line", (line) => {
  if (line.length > 16384) return;
  pending = pending.then(async () => {
    try {
      await command(JSON.parse(line));
    } catch (error) {
      const detail = hostErrorMessage(error);
      log("HOST", detail);
      message(detail);
      state();
    }
  });
});
lines.once("close", () => {
  void pending.finally(quit);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void quit());
try {
  releaseLock = await instanceLock(dir);
  config = loadConfig(dir);
  state();
  if (config) {
    try {
      await start();
    } catch (error) {
      message(hostErrorMessage(error));
    }
  }
  void updates(false).catch(() =>
    message(
      "Updateprüfung derzeit nicht verfügbar. Private GitHub-Repositories benötigen einen Lesezugang in Einstellungen.",
    ),
  );
} catch {
  message(
    "RockLea läuft bereits oder die verschlüsselte Konfiguration ist nicht lesbar.",
  );
  await quit();
} finally {
  finishStartup();
}
