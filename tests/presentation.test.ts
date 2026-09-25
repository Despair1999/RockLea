import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaults,
  playlistName,
  type MatchState,
} from "../packages/shared/model.js";
import { playlists } from "../packages/shared/playlists.js";
import { finalScoreboard } from "../packages/shared/scoreboard.js";
import {
  aggregate,
  wichscounter,
  leaderboard,
  type Observation,
} from "../packages/stats-engine/stats.js";
import {
  recordEmbeds,
  statsEmbed,
  matchEmbed,
  leaderboardEmbeds,
} from "../packages/discord-ui/embeds.js";
import { persistentMessage } from "../packages/discord-ui/persistent-message.js";
import { advance } from "../packages/stats-engine/state.js";
import { fixture } from "./fixtures.js";
function state(): MatchState {
  let s: MatchState | undefined;
  fixture().forEach((e, i) => {
    s = advance(s, e, new Date(1700000000000 + i * 1000).toISOString());
  });
  return s!;
}
function row(
  score: number | undefined,
  playlistId = 13,
  member = "one",
  match = "match",
): Observation {
  const s = state();
  s.game.PlaylistId = playlistId;
  return {
    member_id: member,
    match_id: match,
    state: s,
    stats: { ...Object.values(s.players)[0], Score: score },
  };
}
it.each([
  [299, 1],
  [300, 0],
  [301, 0],
  [0, 1],
  [undefined, 0],
])("counts only final 3v3 scores strictly under 300 (%s)", (score, count) => {
  expect(wichscounter([row(score)])).toBe(count);
});
it.each(
  [...playlists.values()].filter((p) => p.teamSize === 3).map((p) => p.id),
)("counts documented 3v3 playlist %s", (id) =>
  expect(wichscounter([row(299, id)])).toBe(1),
);
it.each([1, 2, 4, 10, 11, 17, 27, 6, 9, 19, 20, 21, 22, 34, 54, 73, 99999])(
  "excludes non-3v3, variable, training and unknown playlist %s",
  (id) => expect(wichscounter([row(299, id)])).toBe(0),
);
it("rejects partial, unended and replay matches", () => {
  for (const change of [
    { sawEnd: false },
    { endedAt: undefined },
    { status: "partial" as const },
    { quality: "partial" as const },
    { game: { PlaylistId: 13, bReplay: true } },
  ]) {
    const r = row(200);
    Object.assign(r.state, change);
    expect(wichscounter([r])).toBe(0);
  }
});
it("deduplicates by member and match; a corrected high score wins", () => {
  expect(wichscounter([row(200), row(200)])).toBe(1);
  expect(wichscounter([row(200), row(300)])).toBe(0);
  expect(wichscounter([row(200), row(200, 13, "two")])).toBe(2);
  expect(aggregate([row(200)]).wichscounter).toBe(1);
  const member = {
    id: "one",
    display_name: "Pilot",
    active: true,
    discord_id: "1",
    identities: [],
    pending_name: null,
    pending_platform: null,
  };
  expect(leaderboard([row(200)], [member], "Wichscounter", 1)[0].value).toBe(1);
});
it("uses real playlist names with a neutral unknown fallback", () => {
  expect(playlistName(10, defaults)).toBe("Ranked 1v1");
  expect(playlistName(999, defaults)).toBe("Playlist 999");
  expect(
    playlistName(13, { ...defaults, playlistNames: { "13": "Teamabend" } }),
  ).toBe("Teamabend");
});
it("projects records without any internal fields and keeps the achievement date", () => {
  const rendered = JSON.stringify(
    recordEmbeds({
      allTime: [
        {
          metric: "Score",
          value: 999,
          unit: "count",
          display_name: "Pilot",
          achieved_at: "2026-09-23T12:00:00Z",
          match_id: "SECRET_MATCH",
          member_id: "SECRET_MEMBER",
          previous: 1234,
          audit: "SECRET_AUDIT",
        },
      ],
    }).map((e) => e.toJSON()),
  );
  expect(rendered).toContain("23.9.2026");
  expect(rendered).toContain("999");
  expect(rendered).toContain("Punkte");
  expect(rendered).not.toMatch(/SECRET|match_id|member_id|previous|1234|audit/);
});
it.each([2, 4, 6, 8, 16])(
  "renders both teams with %s players under Discord limits",
  (count) => {
    const board = Array.from({ length: count }, (_, i) => ({
      team: i % 2,
      name: `Player${i} ` + "*x_".repeat(40),
      score: 100 + i,
      goals: 2,
      assists: 1,
      saves: 3,
      shots: 4,
      demos: 0,
      PrimaryId: "SECRET",
    }));
    const e = matchEmbed(state(), defaults, board).toJSON();
    expect(e.fields?.some((f) => f.name.includes("Blau"))).toBe(true);
    expect(e.fields?.some((f) => f.name.includes("Orange"))).toBe(true);
    for (let i = 0; i < count; i++)
      expect(JSON.stringify(e)).toContain(`Player${i}`);
    expect(JSON.stringify(e)).not.toContain("SECRET");
    expect(e.fields!.every((f) => f.value.length <= 1024)).toBe(true);
    expect(e.fields!.length).toBeLessThanOrEqual(25);
    expect(
      (e.title?.length ?? 0) +
        (e.description?.length ?? 0) +
        (e.footer?.text.length ?? 0) +
        e.fields!.reduce((n, f) => n + f.name.length + f.value.length, 0),
    ).toBeLessThan(6000);
  },
);
it("renders missing measurements as dashes and keeps zero values", () => {
  const e = JSON.stringify(
    matchEmbed(state(), defaults, [
      { team: 0, name: "Zero", score: 0 },
      { team: 1, name: "Missing" },
    ]).toJSON(),
  );
  expect(e).toContain("**0** Punkte");
  expect(e).toContain("T —");
  expect(
    finalScoreboard([
      { team: 0, name: "N", PrimaryId: "secret", nested: { token: "secret" } },
    ]),
  ).toEqual([{ team: 0, name: "N" }]);
  expect(JSON.stringify(statsEmbed(aggregate([row(200)])).toJSON())).toContain(
    "Wichscounter",
  );
  expect(
    leaderboardEmbeds(
      Array.from({ length: 50 }, (_, i) => ({
        member: `Pilot ${i}`,
        value: i,
        matches: 10,
      })),
    ),
  ).toHaveLength(4);
});
it("edits a persisted record message after restart, recreates deleted messages, retries other errors", async () => {
  let stored: string | null = null;
  const send = vi.fn(async () => `message-${send.mock.calls.length}`),
    edit = vi.fn(async (_id: string) => {});
  const save = async (id: string) => {
    stored = id;
  };
  const run = () => persistentMessage(async () => stored, edit, send, save);
  await run();
  const first = stored;
  await run();
  expect(send).toHaveBeenCalledTimes(1);
  expect(edit).toHaveBeenCalledWith(first);
  edit.mockRejectedValueOnce({ code: 10008 });
  await run();
  expect(send).toHaveBeenCalledTimes(2);
  expect(stored).not.toBe(first);
  edit.mockRejectedValueOnce({ code: 50013 });
  await expect(run()).rejects.toEqual({ code: 50013 });
  expect(send).toHaveBeenCalledTimes(2);
});
it("ships all seven transparent, square original-logo icon resolutions", () => {
  const ico = readFileSync("assets/RockLea.ico"),
    sizes = [16, 24, 32, 48, 64, 128, 256];
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(7);
  sizes.forEach((size, i) => {
    const at = 6 + i * 16;
    expect(ico[at] || 256).toBe(size);
    expect(ico[at + 1] || 256).toBe(size);
    const offset = ico.readUInt32LE(at + 12);
    expect(ico.subarray(offset + 1, offset + 4).toString()).toBe("PNG");
    expect(ico.readUInt32BE(offset + 16)).toBe(size);
    expect(ico.readUInt32BE(offset + 20)).toBe(size);
    expect(ico[offset + 25]).toBe(6);
  });
});
