import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
import { resolve, sep } from "node:path";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
const root = resolve("data/postgres-tests");
mkdirSync(root, { recursive: true });
const directory = resolve(root, randomBytes(8).toString("hex"));
if (!directory.startsWith(root + sep))
  throw new Error("Unerwarteter Testdatenpfad.");
const password = randomBytes(24).toString("hex"),
  port = 55439;
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: "rocklea",
  password,
  port,
  persistent: true,
  createPostgresUser: false,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("rocklea_test");
  const cli = resolve("node_modules/vitest/vitest.mjs");
  const code = await new Promise<number>((done, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "run", "tests/integration.test.ts"],
      {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          TEST_DATABASE_URL: `postgresql://rocklea:${password}@127.0.0.1:${port}/rocklea_test`,
        },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => done(code ?? 1));
  });
  process.exitCode = code;
} finally {
  await pg.stop();
}
