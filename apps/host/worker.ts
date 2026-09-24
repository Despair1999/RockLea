import { startBackend } from "../backend/service.js";
import { startDiscordBot } from "../bot/service.js";
import { startCollector } from "../collector/service.js";
const send = (message: unknown) => {
  if (process.connected) process.send?.(message);
};
let stopping = false;
const starting = (async () => {
  const name = process.argv[2];
  if (name === "backend") return startBackend();
  if (name === "discord")
    return startDiscordBot((connected) =>
      send({ type: "connection", connected }),
    );
  if (name === "collector")
    return startCollector(
      process.env.ROCKLEA_DATA_DIR!,
      (message) => send({ type: "diagnostic", message }),
      (status) => send({ type: "collector", ...status }),
    );
  throw new Error("Unknown component");
})();
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await (await starting).stop();
  } finally {
    process.exit(0);
  }
}
process.on("message", (message) => {
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "stop"
  )
    void stop();
});
process.once("disconnect", () => void stop());
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void stop());
try {
  await starting;
  if (!stopping) send({ type: "ready" });
} catch {
  send({ type: "failed" });
  process.exit(1);
}
