import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  const content = readFileSync(".env.example", "utf8").replace(
    /^INTERNAL_TOKEN=$/m,
    `INTERNAL_TOKEN=${randomBytes(32).toString("hex")}`,
  );
  writeFileSync(".env", content, { flag: "wx" });
  console.log(
    ".env mit zufälligem internem Schlüssel erstellt. Discord-Zugangsdaten ergänzen.",
  );
} else console.log("Bestehende .env bleibt erhalten.");
mkdirSync("data", { recursive: true });
