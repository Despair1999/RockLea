import { mkdir, copyFile, cp, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
if (process.platform !== "win32")
  throw new Error("Windows host must be built on Windows.");
const destination = resolve("release/host"),
  app = join(destination, "runtime/app");
await mkdir(app, { recursive: true });
await copyFile(process.execPath, join(destination, "runtime/node.exe"));
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"])
  await copyFile(file, join(app, file));
// Hoisted real directories survive relocation without pnpm junctions. Frozen install preserves all external ESM/WASM assets and licenses, including PGlite.
execFileSync(
  "cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    "pnpm install --prod --offline --frozen-lockfile --ignore-scripts --config.node-linker=hoisted",
  ],
  { cwd: app, stdio: "inherit", windowsHide: true },
);
await cp("dist", join(app, "dist"), { recursive: true });
await cp(
  "packages/database/migrations",
  join(app, "packages/database/migrations"),
  { recursive: true },
);
const compiler = join(
  process.env.WINDIR || "C:/Windows",
  "Microsoft.NET/Framework64/v4.0.30319/csc.exe",
);
execFileSync(
  compiler,
  [
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/optimize+",
    `/win32icon:${resolve("assets/RockLea.ico")}`,
    `/out:${join(destination, "RockLea.exe")}`,
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Web.Extensions.dll",
    resolve("apps/host/Windows.cs"),
  ],
  { stdio: "inherit", windowsHide: true },
);
await writeFile(
  join(destination, "PORTABLE.txt"),
  "RockLea 0.3.1\r\nKeep this entire folder together. Start RockLea.exe. User data stays in %LOCALAPPDATA%\\RockLea.\r\nWindows 10/11 x64, .NET Framework 4.8 (Windows component). Node runtime included. Unsigned build.\r\n",
);
const license = await fetch(
  `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
);
if (!license.ok) throw new Error("Node runtime license download failed.");
await writeFile(
  join(destination, "runtime/NODE-LICENSE.txt"),
  await license.text(),
);
console.log("release/host/RockLea.exe and bundled runtime built.");
