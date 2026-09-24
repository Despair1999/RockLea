import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist/dashboard", { recursive: true });
await build({
  entryPoints: [
    "apps/backend/main.ts",
    "apps/bot/main.ts",
    "scripts/migrate.ts",
    "apps/host/main.ts",
    "apps/host/worker.ts",
    "apps/host/smoke.ts",
  ],
  outdir: "dist",
  outbase: ".",
  platform: "node",
  format: "esm",
  bundle: true,
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: ["apps/dashboard/app.tsx"],
  outfile: "dist/dashboard/app.js",
  bundle: true,
  minify: true,
  platform: "browser",
  format: "esm",
  define: { "process.env.NODE_ENV": '"production"' },
});
await copyFile("apps/dashboard/index.html", "dist/dashboard/index.html");
console.log("Backend, Bot und Dashboard gebaut.");
