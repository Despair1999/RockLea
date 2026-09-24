import { HostError } from "./errors.js";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { VERSION } from "./config.js";
const repo = "https://api.github.com/repos/Despair1999/RockLea";
const asset = z.object({
  name: z.string(),
  url: z.string().url(),
  size: z.number().nonnegative().max(600_000_000),
});
const releaseSchema = z.object({
  tag_name: z.string().regex(/^v\d+\.\d+\.\d+$/),
  draft: z.literal(false),
  prerelease: z.literal(false),
  assets: z.array(asset),
});
export type Release = z.infer<typeof releaseSchema>;
export function newer(version: string, current = VERSION) {
  if (!/^v?\d+\.\d+\.\d+$/.test(version) || !/^v?\d+\.\d+\.\d+$/.test(current))
    return false;
  const a = version.replace(/^v/, "").split(".").map(Number),
    b = current.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
function headers(token: string, binary = false) {
  return {
    Accept: binary ? "application/octet-stream" : "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
export async function checkUpdate(
  dir: string,
  token: string,
  force = false,
): Promise<Release | undefined> {
  const file = join(dir, "update-cache.json");
  if (!force && existsSync(file)) {
    try {
      const cache = JSON.parse(readFileSync(file, "utf8"));
      if (Date.now() - cache.at < 86400000)
        return cache.release ? releaseSchema.parse(cache.release) : undefined;
    } catch {
      /* ignore corrupt cache */
    }
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ at: Date.now() }));
  const response = await fetch(`${repo}/releases/latest`, {
    headers: headers(token),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HostError(
      "Updateprüfung nicht möglich. Bei privatem Repository einen GitHub-Lesezugang in Einstellungen hinterlegen.",
    );
  const release = releaseSchema.parse(await response.json());
  writeFileSync(file, JSON.stringify({ at: Date.now(), release }));
  return release;
}
export function manifestHash(manifest: string, name: string) {
  const lines = manifest
    .split(/\r?\n/)
    .map((line) => line.match(/^([a-fA-F0-9]{64})\s+\*?([^/\\]+)$/))
    .filter((m) => m?.[2] === name);
  if (lines.length !== 1)
    throw new HostError("Hashmanifest fehlt oder ist mehrdeutig.");
  return lines[0]![1].toLowerCase();
}
async function downloadAsset(value: z.infer<typeof asset>, token: string) {
  // Cached metadata is untrusted. Never send credentials to URLs outside this repository's API.
  if (
    !value.url.startsWith(`${repo}/releases/assets/`) ||
    !/^\d+$/.test(value.url.slice(`${repo}/releases/assets/`.length))
  )
    throw new HostError("Unzulässige Updatequelle.");
  const response = await fetch(value.url, {
    headers: headers(token, true),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new HostError("Update-Download fehlgeschlagen.");
  return response;
}
export async function stageUpdate(
  dir: string,
  release: Release,
  token: string,
) {
  if (!newer(release.tag_name))
    throw new HostError("Kein neueres Release verfügbar.");
  const installer = release.assets.find((a) => a.name === "RockLea-Setup.exe"),
    manifest = release.assets.find((a) => a.name === "SHA256SUMS.txt");
  if (!installer || !manifest || manifest.size > 65536)
    throw new HostError("Release-Artefakte fehlen.");
  const expected = manifestHash(
    await (await downloadAsset(manifest, token)).text(),
    installer.name,
  );
  const folder = join(dir, "updates");
  mkdirSync(folder, { recursive: true });
  const target = join(folder, "RockLea-Setup.exe");
  const response = await downloadAsset(installer, token);
  if (!response.body) throw new HostError("Leerer Download.");
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(
      Readable.fromWeb(
        response.body as import("node:stream/web").ReadableStream,
      ),
      new Transform({
        transform(chunk, encoding, callback) {
          size += chunk.length;
          if (size > installer.size || size > 600_000_000)
            return callback(new Error("Update zu groß"));
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(target, { mode: 0o600 }),
    );
    if (size !== installer.size || hash.digest("hex") !== expected)
      throw new HostError("SHA256-Prüfung fehlgeschlagen.");
    return target;
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  }
}
