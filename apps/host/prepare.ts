import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { database, migrate } from "../../packages/database/db.js";
import { Repository } from "../../packages/database/repository.js";
import { protect } from "../collector/windows.js";
import { VERSION, type HostConfig } from "./config.js";
import { backup } from "./migration.js";
/** No concurrent component is running when this function opens the embedded database. */
export async function prepareData(dir: string, config: HostConfig) {
  const path = join(dir, "data", "backend"),
    credentials = join(dir, "credentials.dpapi");
  if (existsSync(credentials) && !existsSync(path))
    throw new Error(
      "Vorhandenes Pairing erkannt: zuerst die alte Datenbank importieren. Es wird keine leere Datenbank angelegt.",
    );
  const marker = join(dir, "data-version");
  const previous = existsSync(marker) ? readFileSync(marker, "utf8") : "";
  if (existsSync(path) && previous !== VERSION) backup(dir);
  mkdirSync(join(dir, "data"), { recursive: true });
  const db = database(`pglite:${path}`);
  try {
    await migrate(db);
    const repo = new Repository(db);
    await repo.setup(config.guildId, "desktop-host");
    if (!existsSync(credentials)) {
      const code = await repo.pairCode(config.guildId, "desktop-host");
      const pair = await repo.pair(code.code, hostname());
      writeFileSync(
        credentials,
        protect(
          JSON.stringify({
            backend: `http://localhost:${config.port}`,
            ...pair,
          }),
          true,
        ),
        { mode: 0o600 },
      );
    } else {
      const old = JSON.parse(protect(readFileSync(credentials, "utf8"), false));
      // Preserve identity/token exactly; only move a local endpoint when its configured port changes.
      const url = new URL(old.backend);
      if (
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        old.backend !== `http://localhost:${config.port}`
      ) {
        old.backend = `http://localhost:${config.port}`;
        writeFileSync(credentials, protect(JSON.stringify(old), true), {
          mode: 0o600,
        });
      }
    }
  } finally {
    await db.close();
  }
  writeFileSync(marker, VERSION);
}
