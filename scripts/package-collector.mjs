import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
if (process.platform !== "win32")
  throw new Error("Windows-Collector auf Windows bauen.");
await mkdir("release", { recursive: true });
await build({
  entryPoints: ["apps/collector/main.ts"],
  outfile: "release/collector.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["bufferutil", "utf-8-validate"],
});
await writeFile(
  "release/sea-config.json",
  JSON.stringify({
    main: "release/collector.cjs",
    output: "release/collector.blob",
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  }),
);
execFileSync(
  process.execPath,
  ["--experimental-sea-config", "release/sea-config.json"],
  { stdio: "inherit" },
);
await copyFile(process.execPath, "release/RLStatsCollector.exe");
const require = createRequire(import.meta.url);
const postject = require.resolve("postject/dist/cli.js");
execFileSync(
  process.execPath,
  [
    postject,
    "release/RLStatsCollector.exe",
    "NODE_SEA_BLOB",
    "release/collector.blob",
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ],
  { stdio: "inherit" },
);
console.log("release/RLStatsCollector.exe erstellt (nicht signiert).");
