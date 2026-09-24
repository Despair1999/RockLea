import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { protect } from "../collector/windows.js";
export const VERSION = "0.2.0";
export const hostConfig = z.object({
  discordToken: z.string().min(20).max(512),
  clientId: z.string().regex(/^\d{5,24}$/),
  clientSecret: z.string().min(16).max(512),
  guildId: z.string().regex(/^\d{5,24}$/),
  internalToken: z.string().min(32).max(512),
  port: z.number().int().min(1024).max(65535).default(3000),
  githubToken: z.string().max(512).default(""),
  autostart: z.boolean().default(false),
});
export type HostConfig = z.infer<typeof hostConfig>;
export type Protector = (value: string, encrypt: boolean) => string;
export function saveConfig(
  dir: string,
  input: unknown,
  crypto: Protector = protect,
) {
  const config = hostConfig.parse(input);
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, "config.dpapi.tmp");
  writeFileSync(temp, crypto(JSON.stringify(config), true), { mode: 0o600 });
  renameSync(temp, join(dir, "config.dpapi"));
  return config;
}
export function loadConfig(
  dir: string,
  crypto: Protector = protect,
): HostConfig | undefined {
  if (!existsSync(join(dir, "config.dpapi"))) return;
  return hostConfig.parse(
    JSON.parse(crypto(readFileSync(join(dir, "config.dpapi"), "utf8"), false)),
  );
}
export function newToken() {
  return randomBytes(32).toString("hex");
}
export function componentEnvironment(config: HostConfig, dir: string) {
  // Explicit map: unrelated development .env values cannot override production secrets.
  return {
    ...process.env,
    ROCKLEA_DATA_DIR: dir,
    HOST: "127.0.0.1",
    PORT: String(config.port),
    DATABASE_URL: `pglite:${join(dir, "data", "backend")}`,
    INTERNAL_TOKEN: config.internalToken,
    DISCORD_TOKEN: config.discordToken,
    DISCORD_CLIENT_ID: config.clientId,
    DISCORD_CLIENT_SECRET: config.clientSecret,
    DISCORD_GUILD_ID: config.guildId,
    BACKEND_PUBLIC_URL: `http://localhost:${config.port}`,
    BACKEND_INTERNAL_URL: `http://127.0.0.1:${config.port}`,
    NODE_ENV: "desktop",
    NODE_OPTIONS: "",
  };
}
export async function validateDiscord(config: HostConfig) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { authorization: `Bot ${config.discordToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      "Discord-Token konnte nicht bestätigt werden. Token und Internetverbindung prüfen.",
    );
  const user = (await response.json()) as { id?: string; bot?: boolean };
  if (!user.bot || user.id !== config.clientId)
    throw new Error("Client-ID gehört nicht zum angegebenen Bot.");
  const guild = await fetch(
    `https://discord.com/api/v10/guilds/${config.guildId}`,
    {
      headers: { authorization: `Bot ${config.discordToken}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!guild.ok)
    throw new Error(
      "Bot hat keinen Zugriff auf diesen Server. Bot zuerst einladen und Server-ID prüfen.",
    );
}
