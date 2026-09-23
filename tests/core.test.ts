import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  parse,
  sanitize,
  mergePlayer,
  knownEvents,
} from "../packages/rocket-league-api/parser.js";
import { advance } from "../packages/stats-engine/state.js";
import {
  defaults,
  type Member,
  type Player,
  type MatchState,
} from "../packages/shared/model.js";
import { aggregate, range, sessions } from "../packages/stats-engine/stats.js";
import {
  ratingChange,
  NullRatingProvider,
  type Rating,
} from "../packages/rating-providers/index.js";
import { updateIni } from "../apps/collector/windows.js";
import { commandDefinitions } from "../apps/bot/commands.js";
import { resultEmbeds, matchEmbed } from "../packages/discord-ui/embeds.js";
import { fixture, niklas, deliveries } from "./fixtures.js";
const member: Member = {
  id: "member",
  discord_id: "100001",
  display_name: "Niklas",
  active: true,
  pending_name: null,
  pending_platform: null,
  identities: [niklas],
};
describe("official protocol and privacy", () => {
  it("validates envelope, rejects malformed JSON", () => {
    expect(() => parse("{")).toThrow();
    expect(() => parse({ event: "wrong" })).toThrow();
    expect(parse({ Event: "Future", Data: { newField: 1 } }).Event).toBe(
      "Future",
    );
  });
  it("supports all documented events", () => {
    expect(knownEvents.size).toBe(22);
  });
  it("removes non-member identities and arbitrary nested fields", () => {
    const e = fixture()[3];
    e.Data.secret = { Name: "RandomPlayer" };
    const clean = sanitize(e, [member]);
    expect(JSON.stringify(clean)).not.toMatch(
      /RandomPlayer|opponent-secret|other-secret|secret/,
    );
    expect((clean.Data.Players as Player[]).length).toBe(1);
  });
  it("does not require spectator fields", () => {
    expect(() => sanitize(fixture()[3], [member])).not.toThrow();
  });
  it("disabled members are not retained", () => {
    expect(
      sanitize(fixture()[3], [{ ...member, active: false }]).Data
        .Players as Player[],
    ).toHaveLength(0);
  });
  it("pending platform and name must be unambiguous", () => {
    const pending = {
      ...member,
      identities: [],
      pending_name: "NiklasRL",
      pending_platform: "Epic",
    };
    expect(
      sanitize(fixture()[3], [pending, { ...pending, id: "other" }]).Data
        .Players as Player[],
    ).toHaveLength(0);
  });
  it("does not resolve ambiguous event display names", () => {
    const p = { Name: "NiklasRL", PrimaryId: niklas, TeamNum: 0, Shortcut: 1 };
    const out = sanitize(
      fixture()[5],
      [member],
      [p, { ...p, PrimaryId: "Epic|different|0" }],
    );
    expect(out.Data.Scorer).toBeUndefined();
  });
  it("never decreases counters from delayed observations", () => {
    expect(
      mergePlayer(
        { Name: "N", PrimaryId: niklas, TeamNum: 0, Goals: 4 },
        { Name: "N2", PrimaryId: niklas, TeamNum: 0, Goals: 1 },
      ).Goals,
    ).toBe(4);
  });
});
describe("state machine", () => {
  it("handles complete match, late final state and duplicate lifecycle", () => {
    let s: MatchState | undefined;
    for (const d of deliveries()) s = advance(s, d.event, d.occurredAt);
    expect(s?.status).toBe("complete");
    expect(s?.quality).toBe("complete");
    expect(s?.winner).toBe(0);
    s = advance(s, fixture()[3], new Date().toISOString());
    expect(s.phase).toBe("DESTROYED");
    expect(s.players[niklas].Goals).toBe(3);
  });
  it("recovers without MatchEnded", () => {
    let s: MatchState | undefined;
    for (const d of deliveries().filter((x) => x.event.Event !== "MatchEnded"))
      s = advance(s, d.event, d.occurredAt);
    expect(s?.quality).toBe("recovered");
    expect(s?.status).toBe("partial");
  });
  it("late join is partial and empty destruction invalid", () => {
    const s = advance(undefined, fixture().at(-1)!, new Date().toISOString());
    expect(s.quality).toBe("invalid");
    expect(s.status).toBe("aborted");
  });
  it("unknown events do not change phase", () => {
    expect(
      advance(
        undefined,
        { Event: "FutureEvent", Data: {} },
        new Date().toISOString(),
      ).phase,
    ).toBe("WAITING");
  });
  it("retains players who leave before final state", () => {
    let s = advance(undefined, fixture()[3], new Date().toISOString());
    s = advance(
      s,
      { Event: "UpdateState", Data: { Players: [], Game: {} } },
      new Date().toISOString(),
    );
    expect(s.players[niklas]).toBeDefined();
  });
  it("overtime survives later states with false flag", () => {
    let s = advance(
      undefined,
      {
        Event: "UpdateState",
        Data: { Players: [], Game: { bOvertime: true } },
      },
      new Date().toISOString(),
    );
    s = advance(
      s,
      {
        Event: "UpdateState",
        Data: { Players: [], Game: { bOvertime: false } },
      },
      new Date().toISOString(),
    );
    expect(s.game.bOvertime).toBe(true);
  });
});
describe("stats and ratings", () => {
  it("missing metrics stay unavailable", () => {
    const a = aggregate([]);
    expect(a.totals.Goals).toBeNull();
    expect(a.winrate).toBeNull();
  });
  it("respects Berlin DST on day boundaries", () => {
    const r = range(
      { period: "today" },
      defaults,
      DateTime.fromISO("2026-03-29T20:00:00Z"),
    );
    expect(new Date(r.from).toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });
  it("requires a configured season", () => {
    expect(() => range({ period: "season" }, defaults)).toThrow();
  });
  it("groups matches across 45-minute session timeout", () => {
    const state = advance(undefined, fixture()[8], "2026-09-22T16:00:00Z");
    const a = {
      member_id: "m",
      match_id: "a",
      stats: state.players[niklas],
      state: { ...state, endedAt: "2026-09-22T16:05:00Z" },
    };
    const b = {
      ...a,
      match_id: "b",
      state: {
        ...a.state,
        startedAt: "2026-09-22T17:00:00Z",
        endedAt: "2026-09-22T17:05:00Z",
      },
    };
    expect(sessions([a, b], 45)).toHaveLength(2);
  });
  it("never labels ambiguous or manual differences as match MMR", () => {
    const a: Rating = {
      memberId: "m",
      playlistId: 11,
      mmr: 1400,
      timestamp: "2026-01-01T00:00:00Z",
      source: "manual",
      confidence: "manual",
    };
    expect(
      ratingChange(
        a,
        { ...a, mmr: 1409, timestamp: "2026-01-01T00:10:00Z" },
        { matches: 1, preMatchConfirmed: true, postMatchConfirmed: true },
      )?.label,
    ).toBe("MMR change since last measurement");
  });
  it("null provider returns no fake ratings", async () => {
    expect(await new NullRatingProvider().getRating()).toBeNull();
  });
});
describe("Windows configuration and Discord UI", () => {
  it("preserves unknown sections and keys and is idempotent", () => {
    const input =
      "[Other]\r\nPort=5\r\n[TAGame.MatchStatsExporter_TA]\r\nUnknown=keep\r\nPacketSendRate=120\r\n[Next]\r\nWebPort=4";
    const out = updateIni(input);
    expect(out).toContain("Unknown=keep");
    expect(out).toContain("[Other]\r\nPort=5");
    expect(out).toContain("PacketSendRate=10");
    expect(updateIni(out)).toBe(out);
  });
  it("validates packet rate", () => expect(() => updateIni("", 121)).toThrow());
  it("serializes every slash command and keeps limits", () => {
    expect(commandDefinitions.length).toBeGreaterThan(12);
    for (const c of commandDefinitions) {
      expect(c.name.length).toBeLessThanOrEqual(32);
      expect(c.options?.length ?? 0).toBeLessThanOrEqual(25);
    }
  });
  it("paginates large outputs and respects embed limits", () => {
    const p = resultEmbeds(
      "Test",
      Array.from({ length: 200 }, (_, i) => ({
        member: `Member ${i}`,
        value: i,
      })),
    );
    expect(p.length).toBeGreaterThan(1);
    for (const e of p)
      expect(e.toJSON().description!.length).toBeLessThan(4096);
  });
  it("labels incomplete data and never fabricates MMR", () => {
    const s = advance(undefined, fixture()[8], new Date().toISOString());
    expect(matchEmbed(s, defaults).toJSON().footer?.text).toContain(
      "MMR nicht verfügbar",
    );
  });
});
