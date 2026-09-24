import { startBackend } from "./service.js";
const backend = await startBackend();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => void backend.stop());
