import { startDiscordBot } from "./service.js";
const bot = await startDiscordBot();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void bot.stop());
