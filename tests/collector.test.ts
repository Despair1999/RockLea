import { it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Outbox, flush, backoff } from "../apps/collector/outbox.js";
import { CollectorStream } from "../apps/collector/stream.js";
import { fixture, niklas } from "./fixtures.js";
import { type Member, type Player } from "../packages/shared/model.js";
const member: Member = {
  id: "niklas",
  discord_id: "100001",
  display_name: "Niklas",
  active: true,
  pending_name: null,
  pending_platform: null,
  identities: [niklas],
};
it("flushes the throttled final snapshot before match end without opponent data", () => {
  const stream = new CollectorStream();
  const states = fixture().filter((e) => e.Event === "UpdateState");
  expect(stream.accept(JSON.stringify(states[0]), [member], 1000)).toHaveLength(
    1,
  );
  expect(
    stream.accept(JSON.stringify(states.at(-1)), [member], 1100),
  ).toHaveLength(0);
  const result = stream.accept(
    JSON.stringify({
      Event: "MatchEnded",
      Data: { MatchGuid: "fixture-match", WinnerTeamNum: 0 },
    }),
    [member],
    1200,
  );
  expect(result.map((e) => e.Event)).toEqual(["UpdateState", "MatchEnded"]);
  expect((result[0].Data.Players as Player[])[0].Goals).toBe(3);
  expect(JSON.stringify(result)).not.toMatch(/RandomPlayer|opponent-secret/);
});
it("discards replay events until a new live match begins", () => {
  const stream = new CollectorStream();
  const send = (Event: string) =>
    stream.accept(JSON.stringify({ Event, Data: { MatchGuid: "replay" } }), [
      member,
    ]);
  send("ReplayCreated");
  expect(send("MatchEnded")).toEqual([]);
  expect(send("GoalScored")).toEqual([]);
  expect(send("MatchDestroyed")).toEqual([]);
  expect(send("MatchCreated")).toHaveLength(1);
});
it("rechecks the whitelist before flushing a buffered snapshot", () => {
  const stream = new CollectorStream();
  const states = fixture().filter((e) => e.Event === "UpdateState");
  stream.accept(JSON.stringify(states[0]), [member], 1000);
  stream.accept(JSON.stringify(states.at(-1)), [member], 1100);
  const result = stream.accept(
    JSON.stringify({
      Event: "MatchEnded",
      Data: { MatchGuid: "fixture-match" },
    }),
    [],
    1200,
  );
  expect(JSON.stringify(result)).not.toContain(niklas);
});
it("persists ordered events during outage and only deletes acknowledged deliveries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rocklea-test-"));
  const path = join(dir, "outbox.sqlite");
  let q = new Outbox(path);
  try {
    const a = q.put({ Event: "MatchCreated", Data: { MatchGuid: "a" } }),
      b = q.put({ Event: "MatchEnded", Data: { MatchGuid: "a" } });
    await expect(
      flush(q, async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow();
    expect(q.depth()).toBe(2);
    q.close();
    q = new Outbox(path);
    expect(q.batch().map((e) => e.id)).toEqual([a.id, b.id]);
    await flush(q, async () => ({ accepted: [a.id, "not-in-batch"] }));
    expect(q.batch().map((e) => e.id)).toEqual([b.id]);
  } finally {
    q.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("caps retry backoff", () => {
  expect(backoff(100)).toBeLessThan(60500);
  expect(backoff(0)).toBeGreaterThanOrEqual(1000);
});
