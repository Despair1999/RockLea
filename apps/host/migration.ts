import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { hostConfig, newToken, saveConfig, type Protector } from "./config.js";
export function copySafe(source: string, destination: string) {
  function inspect(path: string) {
    if (lstatSync(path).isSymbolicLink())
      throw new Error("Verknüpfungen im Datenordner werden nicht importiert.");
    if (lstatSync(path).isDirectory())
      for (const name of readdirSync(path)) inspect(join(path, name));
  }
  inspect(source);
  cpSync(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}
export function backup(dir: string) {
  const target = join(
    dir,
    "backups",
    new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid,
  );
  mkdirSync(target, { recursive: true });
  for (const name of [
    "config.dpapi",
    "credentials.dpapi",
    "outbox.sqlite",
    "outbox.sqlite-wal",
    "outbox.sqlite-shm",
    "data",
  ])
    if (existsSync(join(dir, name)))
      copySafe(join(dir, name), join(target, name));
  return target;
}
/** Call only while all old and new components are stopped. Original files are untouched. */
export function importLegacy(source: string, dir: string, crypto?: Protector) {
  if (
    existsSync(join(dir, "config.dpapi")) ||
    existsSync(join(dir, "data", "backend"))
  )
    throw new Error(
      "Ziel enthält bereits eine Konfiguration oder Datenbank. Import würde vorhandene Daten überschreiben.",
    );
  const env = parseEnv(readFileSync(join(source, ".env"), "utf8"));
  const config = hostConfig.parse({
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    guildId: env.DISCORD_GUILD_ID,
    internalToken: env.INTERNAL_TOKEN || newToken(),
    port: Number(env.PORT || 3000),
  });
  if (env.DATABASE_URL && !env.DATABASE_URL.startsWith("pglite:"))
    throw new Error(
      "Externe PostgreSQL-Datenbank: weiterhin Serverbetrieb verwenden; automatischer Desktop-Import unterstützt lokale PGlite-Daten.",
    );
  const database = resolve(
    source,
    (env.DATABASE_URL || "pglite:data/backend").slice(7),
  );
  if (!existsSync(database))
    throw new Error(
      "Alte Datenbank fehlt. Import abgebrochen, um kein vorhandenes Pairing mit einer leeren Datenbank zu verbinden.",
    );
  backup(dir);
  const staging = join(dir, "import-" + Date.now());
  mkdirSync(staging, { recursive: true });
  copySafe(database, join(staging, "backend"));
  mkdirSync(join(dir, "data"), { recursive: true });
  // Stage both before making either production file visible. Keep staging on failure.
  saveConfig(staging, config, crypto);
  renameSync(join(staging, "backend"), join(dir, "data", "backend"));
  renameSync(join(staging, "config.dpapi"), join(dir, "config.dpapi"));
  return config;
}
