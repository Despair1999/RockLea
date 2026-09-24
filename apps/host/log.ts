import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
export function rotatingLog(dir: string) {
  const folder = join(dir, "logs");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "rocklea.log");
  return (component: string, message: string) => {
    try {
      if (existsSync(file) && statSync(file).size >= 2_000_000) {
        if (existsSync(file + ".3")) rmSync(file + ".3");
        for (let n = 2; n >= 1; n--)
          if (existsSync(file + "." + n))
            renameSync(file + "." + n, file + "." + (n + 1));
        renameSync(file, file + ".1");
      }
      appendFileSync(
        file,
        `${new Date().toISOString()} [${component}] ${message.slice(0, 1000).replace(/[\r\n]/g, " ")}\n`,
      );
    } catch {
      /* The UI reports state independently of disk logging. */
    }
  };
}
