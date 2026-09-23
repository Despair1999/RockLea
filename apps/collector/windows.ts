import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
export function updateIni(text: string, rate = 10) {
  if (!Number.isInteger(rate) || rate < 1 || rate > 120)
    throw new Error("PacketSendRate muss zwischen 1 und 120 liegen.");
  const lines = text.split(/\r?\n/);
  const section = "[TAGame.MatchStatsExporter_TA]";
  let start = lines.findIndex(
    (l) => l.trim().toLowerCase() === section.toLowerCase(),
  );
  if (start < 0) {
    lines.push("", section);
    start = lines.length - 1;
  }
  let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  if (end < 0) end = lines.length;
  for (const [key, value] of Object.entries({
    PacketSendRate: rate,
    Port: 0,
    WebPort: 49124,
  })) {
    const indexes = lines
      .map((l, i) =>
        i > start && i < end && new RegExp(`^\\s*${key}\\s*=`, "i").test(l)
          ? i
          : -1,
      )
      .filter((i) => i >= 0);
    if (indexes.length) for (const i of indexes) lines[i] = `${key}=${value}`;
    else {
      lines.splice(end, 0, `${key}=${value}`);
      end++;
    }
  }
  return lines.join("\r\n");
}
export function findInstallations() {
  const roots = new Set<string>();
  const manifests = join(
    process.env.ProgramData ?? "C:\\ProgramData",
    "Epic",
    "EpicGamesLauncher",
    "Data",
    "Manifests",
  );
  if (existsSync(manifests))
    for (const file of readdirSync(manifests).filter((f) =>
      f.endsWith(".item"),
    ))
      try {
        const m = JSON.parse(readFileSync(join(manifests, file), "utf8")) as {
          DisplayName?: string;
          InstallLocation?: string;
        };
        if (
          m.DisplayName?.toLowerCase().includes("rocket league") &&
          m.InstallLocation
        )
          roots.add(m.InstallLocation);
      } catch {
        /* An unrelated launcher manifest may be incomplete. */
      }
  const reg = spawnSync(
    "reg",
    ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"],
    { encoding: "utf8", windowsHide: true },
  );
  const path = reg.stdout?.match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1].trim();
  const libraries = new Set(
    [
      path,
      join(
        process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
        "Steam",
      ),
    ].filter((x): x is string => !!x),
  );
  for (const library of [...libraries]) {
    const file = join(library, "steamapps", "libraryfolders.vdf");
    if (existsSync(file)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/"path"\s+"([^"]+)"/g))
        libraries.add(m[1].replaceAll("\\\\", "\\"));
    }
  }
  for (const library of libraries)
    roots.add(join(library, "steamapps", "common", "rocketleague"));
  return [...roots]
    .map((root) => join(root, "TAGame", "Config"))
    .filter(existsSync)
    .map((root) => {
      const ta = join(root, "TAStatsAPI.ini");
      return existsSync(ta) ? ta : join(root, "DefaultStatsAPI.ini");
    })
    .filter(existsSync);
}
export function configure(path: string, rate = 10) {
  if (
    !/^(TAStatsAPI|DefaultStatsAPI)\.ini$/i.test(
      path.split(/[\\/]/).at(-1) ?? "",
    )
  )
    throw new Error("Bitte eine Stats-API-INI auswählen.");
  const original = readFileSync(path);
  const utf16 = original[0] === 255 && original[1] === 254;
  const encoding = utf16 ? "utf16le" : "utf8";
  const next = updateIni(original.toString(encoding), rate);
  if (next === original.toString(encoding)) return;
  copyFileSync(path, `${path}.${Date.now()}.bak`);
  writeFileSync(path, next, encoding);
  console.log(
    `Stats API konfiguriert: ${path}. Rocket League muss neu gestartet werden.`,
  );
}
export function protect(value: string, encrypt: boolean): string {
  if (process.platform !== "win32")
    throw new Error(
      "Der Collector speichert Credentials ausschließlich mit Windows DPAPI.",
    );
  const op = encrypt ? "Protect" : "Unprotect";
  const script = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${op}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      input: encrypt ? Buffer.from(value).toString("base64") : value,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    throw new Error(
      "Windows-Credentials konnten nicht geschützt/gelesen werden.",
    );
  return encrypt
    ? result.stdout.trim()
    : Buffer.from(result.stdout.trim(), "base64").toString("utf8");
}
export function autostart(executable: string, enable: boolean) {
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const args = enable
    ? [
        "add",
        key,
        "/v",
        "RockLeaCollector",
        "/t",
        "REG_SZ",
        "/d",
        `"${executable}"`,
        "/f",
      ]
    : ["delete", key, "/v", "RockLeaCollector", "/f"];
  const result = spawnSync("reg", args, {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error("Autostart konnte nicht aktualisiert werden.");
}
export { dirname };
