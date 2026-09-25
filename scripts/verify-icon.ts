import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const ico = readFileSync("assets/RockLea.ico");
for (const path of process.argv.slice(2)) {
  const exe = readFileSync(path);
  assert.equal(exe.toString("ascii", 0, 2), "MZ");
  assert.equal(
    exe.toString("ascii", exe.readUInt32LE(60), exe.readUInt32LE(60) + 4),
    "PE\0\0",
  );
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const entry = 6 + i * 16,
      offset = ico.readUInt32LE(entry + 12),
      length = ico.readUInt32LE(entry + 8);
    assert.ok(
      exe.includes(ico.subarray(offset, offset + length)),
      `${path}: missing embedded ${ico[entry] || 256}px original icon`,
    );
  }
  console.log(`${path}: original seven-resolution icon embedded in PE`);
}
