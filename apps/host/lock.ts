import { createServer } from "node:net";
import { createHash } from "node:crypto";
export async function availablePort(port: number) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} ist belegt. Alte RockLea-Prozesse beenden oder in Einstellungen einen anderen Port wählen.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
}
export async function instanceLock(dir: string) {
  const id = createHash("sha256")
    .update(dir.toLowerCase())
    .digest("hex")
    .slice(0, 16);
  const server = createServer((socket) => socket.destroy());
  const address =
    process.platform === "win32"
      ? `\\\\.\\pipe\\rocklea-${id}`
      : {
          port: 40000 + (parseInt(id.slice(0, 4), 16) % 20000),
          host: "127.0.0.1",
        };
  await new Promise<void>((resolve, reject) => {
    server.once("error", () => reject(new Error("RockLea läuft bereits.")));
    server.listen(address, resolve);
  });
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
