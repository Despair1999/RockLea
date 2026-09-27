import { it, expect } from "vitest";
import { fixture, niklas } from "./fixtures.js";
import { advance } from "../packages/stats-engine/state.js";
import {
  aggregate,
  resultRows,
  select,
  type Observation,
} from "../packages/stats-engine/stats.js";
import { defaults, type MatchState } from "../packages/shared/model.js";
import {
  memberBoard,
  lifetimeLeaderboard,
  splitRecordChannels,
} from "../packages/discord-ui/boards.js";
import { statsEmbed } from "../packages/discord-ui/embeds.js";
function rows(): Observation[] {
  let state: MatchState | undefined;
  fixture().forEach((e, i) => {
    state = advance(
      state,
      e,
      new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString(),
    );
  });
  return Array.from({ length: 11 }, (_, i) => ({
    member_id: "m",
    match_id: String(i),
    stats: { ...state!.players[niklas], TeamNum: 0 },
    state: { ...state!, winner: i < 5 ? 0 : i < 8 ? 1 : undefined },
  }));
}
it("11 observations with five wins and three losses yield eight matches and 62.5%", () => {
  const r = rows(),
    s = aggregate(r);
  expect(s.matches).toBe(8);
  expect(s.wins).toBe(5);
  expect(s.losses).toBe(3);
  expect(s.winrate).toBe(62.5);
  expect(s.totals.Score).toBe(8 * r[0].stats.Score!);
  expect(s.coverage.Goals).toBe(8);
  expect(s.unknown).toBe(0);
  expect(select(r, { period: "all" }, defaults)).toHaveLength(8);
});
it("rejects unfinished, invalid-team and replay results, deduplicates member/match", () => {
  const r = rows()[0];
  expect(resultRows([r, r])).toHaveLength(1);
  for (const change of [
    { sawEnd: false },
    { endedAt: undefined },
    { status: "partial" as const },
    { winner: 2 },
    { game: { bReplay: true } },
  ])
    expect(
      aggregate([{ ...r, state: { ...r.state, ...change } }]).matches,
    ).toBe(0);
  expect(
    aggregate([{ ...r, stats: { ...r.stats, TeamNum: 255 } }]).matches,
  ).toBe(0);
});
it("server view distinguishes shared matches from member results", () => {
  const r = rows()[0],
    s = aggregate([r, { ...r, member_id: "other" }]);
  expect(s.matches).toBe(2);
  expect(s.wins).toBe(2);
  const e = statsEmbed({ matches: 1, memberResults: s }).toJSON();
  expect(e.description).toContain("1 verschiedene Matches");
  expect(e.description).toContain("2 Mitglieder-Ergebnisse");
});
it("lifetime boards contain six independent total rankings and one personal embed", () => {
  const data = [
    { memberId: "one", member: "One", stats: aggregate(rows()) },
    { memberId: "two", member: "Two", stats: aggregate([]) },
  ];
  const board = lifetimeLeaderboard(data)[0].toJSON();
  expect(board.fields?.map((f) => f.name)).toEqual([
    "⚽ Tore",
    "🧤 Paraden",
    "💯 Score · Summe",
    "🎯 Schüsse",
    "Abwichscounter",
    "🎮 Spiele",
  ]);
  expect(board.title).toContain("Allzeit");
  expect(memberBoard(data[0]).toJSON().description).toContain("8 Matches");
  expect(JSON.stringify(board)).not.toContain("memberId");
  const pages = lifetimeLeaderboard(
    Array.from({ length: 31 }, (_, i) => ({
      ...data[0],
      memberId: String(i),
      member: "*".repeat(128),
    })),
  );
  expect(pages).toHaveLength(4);
  for (const page of pages) {
    const e = page.toJSON();
    expect(e.fields!.every((f) => f.value.length <= 1024)).toBe(true);
    expect(
      e.fields!.reduce((n, f) => n + f.name.length + f.value.length, 0) +
        (e.title?.length ?? 0) +
        (e.description?.length ?? 0) +
        (e.footer?.text.length ?? 0),
    ).toBeLessThan(6000);
  }
});
it("automatically splits old shared record channel and preserves the saved mapping on restart", async () => {
  const ensure = async (name: string) =>
    name === "rl-records" ? "records" : "table";
  const split = await splitRecordChannels(
    { records: "records", stats: "stats" },
    ensure,
  );
  expect(split).toEqual({
    records: "table",
    recordAnnouncements: "records",
    stats: "stats",
  });
  expect(
    await splitRecordChannels(split, async () => {
      throw Error("must reuse");
    }),
  ).toEqual(split);
  expect(
    await splitRecordChannels({ records: "custom-table" }, ensure),
  ).toEqual({ records: "custom-table", recordAnnouncements: "records" });
  await expect(
    splitRecordChannels({ records: "records" }, async () => {
      throw Error("no permission");
    }),
  ).rejects.toThrow("no permission");
});
