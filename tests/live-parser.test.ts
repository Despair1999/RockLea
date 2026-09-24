import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { fixture, niklas } from "./fixtures.js";
import {
  type Envelope,
  type Member,
  type Player,
} from "../packages/shared/model.js";
import {
  statePlayers,
  sanitize,
  gameOf,
} from "../packages/rocket-league-api/parser.js";
import {
  formatIssue,
  parserFailure,
  diagnosticLogger,
  type ParseIssue,
} from "../packages/rocket-league-api/diagnostics.js";
import { CollectorStream } from "../apps/collector/stream.js";
import { receive } from "../apps/collector/receive.js";
import { OutboxFullError } from "../apps/collector/outbox.js";
import {
  Heartbeat,
  type CollectorStatus,
} from "../apps/collector/heartbeat.js";
import { advance } from "../packages/stats-engine/state.js";
const member: Member = {
  id: "registered",
  discord_id: "100001",
  display_name: "Registered",
  active: true,
  pending_name: null,
  pending_platform: null,
  identities: [niklas],
};
const tick = () => structuredClone(fixture()[3]);
const lifecycle = (Event: string): Envelope => ({
  Event,
  Data: { MatchGuid: "fixture-match" },
});
const accept = (stream: CollectorStream, event: Envelope, now = 1000) =>
  stream.accept(JSON.stringify(event), [member], now);

describe("tolerant live projection", () => {
  it("skips an invalid opponent but keeps valid registered players and metadata", () => {
    const event = tick();
    (event.Data.Players as unknown[]).push({
      Name: "PRIVATE_OPPONENT",
      PrimaryId: "INVALID_PRIVATE_ID",
      TeamNum: 1,
    });
    const issues: ParseIssue[] = [];
    expect(statePlayers(event, (i) => issues.push(i))).toHaveLength(4);
    const clean = sanitize(event, [member]);
    expect((clean.Data.Players as Player[]).map((p) => p.PrimaryId)).toEqual([
      niklas,
    ]);
    expect(clean.Data.Game).toHaveProperty("PlaylistId", 11);
    expect(issues).toHaveLength(1);
    expect(formatIssue(issues[0])).toContain("Data.Players.4.PrimaryId");
    expect(JSON.stringify(clean)).not.toMatch(
      /PRIVATE|RandomPlayer|opponent-secret/,
    );
  });
  it("rejects invalid counters on just that player without weakening the player schema", () => {
    const event = tick();
    (event.Data.Players as Player[])[1].Goals = -1;
    expect(statePlayers(event)).toHaveLength(3);
    expect(statePlayers(event).some((p) => p.PrimaryId === niklas)).toBe(true);
    expect(statePlayers(event).some((p) => p.Goals === -1)).toBe(false);
  });
  it.each([undefined, null, "", "   ", 42, "g".repeat(129)])(
    "ignores unusable MatchGuid %s before parsing malformed players",
    (guid) => {
      const event: Envelope = {
        Event: "UpdateState",
        Data: { MatchGuid: guid, Players: "bad", Game: null },
      };
      expect(accept(new CollectorStream(), event)).toEqual([]);
      expect(statePlayers(event)).toEqual([]);
      expect(sanitize(event, [member]).Data).toEqual({});
    },
  );
  it("enforces the 64-player limit, rejecting oversized arrays rather than hiding ambiguity", () => {
    const event = tick();
    event.Data.Players = Array.from({ length: 65 }, () => ({
      PrimaryId: niklas,
      Name: "N",
      TeamNum: 0,
    }));
    expect(() => statePlayers(event)).toThrow(z.ZodError);
    expect(() => accept(new CollectorStream(), event)).toThrow(z.ZodError);
  });
  it("strips unknown nested fields and handles malformed optional Game fields independently", () => {
    const event = tick();
    const p = (event.Data.Players as Player[])[0];
    Object.assign(p, { Loadout: ["PRIVATE_LOADOUT"], Secret: "PRIVATE_TOKEN" });
    event.Data.Game = {
      PlaylistId: 11,
      TimeSeconds: null,
      bOvertime: "unknown",
      Winner: null,
      Arena: "Stadium_P",
      Target: { Name: "PRIVATE_TARGET" },
      Teams: [
        { TeamNum: 0, Score: 3, Name: "PRIVATE_TEAM" },
        { TeamNum: 1, Score: "bad" },
      ],
    };
    const clean = sanitize(event, [member]);
    expect(clean.Data.Game).toEqual({
      PlaylistId: 11,
      Arena: "Stadium_P",
      Teams: [{ TeamNum: 0, Score: 3 }],
    });
    expect(JSON.stringify(clean)).not.toMatch(/PRIVATE|Loadout|Target/);
  });
  it.each([undefined, null, "bad", []])(
    "retains players when Game is absent or malformed",
    (game) => {
      const event = tick();
      event.Data.Game = game;
      expect(gameOf(event)).toEqual({});
      expect(
        (sanitize(event, [member]).Data.Players as Player[])[0].PrimaryId,
      ).toBe(niklas);
      const state = advance(undefined, event, new Date().toISOString());
      expect(state.game).not.toHaveProperty("bOvertime");
    },
  );
  it("keeps known team scores across a later incomplete Game projection", () => {
    const event = tick();
    event.Data.Game = {
      Teams: [
        { TeamNum: 0, Score: 2 },
        { TeamNum: 1, Score: 1 },
      ],
      bOvertime: true,
    };
    let state = advance(undefined, event, new Date().toISOString());
    event.Data.Game = {
      Teams: [
        { TeamNum: 0, Score: 3 },
        { TeamNum: 1, Score: null },
      ],
      bOvertime: null,
    };
    state = advance(state, event, new Date().toISOString());
    expect(state.game.Teams).toEqual([
      { TeamNum: 0, Score: 3 },
      { TeamNum: 1, Score: 1 },
    ]);
    expect(state.game.bOvertime).toBe(true);
  });
  it("never invents an ID from the display name", () => {
    const event = tick();
    event.Data.Players = [{ Name: "RegisteredPilot", TeamNum: 0 }];
    const pending = {
      ...member,
      identities: [],
      pending_name: "RegisteredPilot",
      pending_platform: "Epic",
    };
    expect(sanitize(event, [pending]).Data.Players).toEqual([]);
    event.Data.Players = [
      {
        Name: "RegisteredPilot",
        TeamNum: 0,
        PrimaryId: "Epic|00112233445566778899|0",
      },
    ];
    expect(
      (sanitize(event, [pending]).Data.Players as Player[])[0].PrimaryId,
    ).toBe("Epic|00112233445566778899|0");
  });
  it("does not guess pending identities when a malformed same-name peer is present", () => {
    const event = tick();
    const p = (event.Data.Players as Player[])[0];
    event.Data.Players = [p, { ...p, PrimaryId: "Epic|other|0", Goals: -1 }];
    expect(
      sanitize(event, [
        {
          ...member,
          identities: [],
          pending_name: p.Name,
          pending_platform: "Epic",
        },
      ]).Data.Players,
    ).toEqual([]);
  });
  it("does not resolve name-only refs by silently discarding a malformed same-name peer", () => {
    const stream = new CollectorStream(),
      event = tick(),
      p = (event.Data.Players as Player[])[0];
    event.Data.Players = [p, { ...p, PrimaryId: "Epic|other|0", Goals: -1 }];
    accept(stream, event);
    const goal: Envelope = {
      Event: "GoalScored",
      Data: {
        MatchGuid: "fixture-match",
        Scorer: { Name: p.Name, TeamNum: p.TeamNum, Shortcut: p.Shortcut },
      },
    };
    expect(accept(stream, goal)[0].Data.Scorer).toBeUndefined();
  });
});
describe("replay and lifecycle regressions", () => {
  it("resumes after a normal goal replay and flushes the last live snapshot at the end", () => {
    const stream = new CollectorStream();
    accept(stream, tick());
    const final = fixture()
      .filter((e) => e.Event === "UpdateState")
      .at(-1)!;
    expect(accept(stream, final, 1100)).toEqual([]);
    accept(stream, lifecycle("GoalReplayStart"), 1200);
    const replay = tick();
    (replay.Data.Game as Record<string, unknown>).bReplay = true;
    expect(accept(stream, replay, 1300)).toEqual([]);
    expect(accept(stream, lifecycle("GoalScored"), 1400)).toEqual([]);
    accept(stream, lifecycle("GoalReplayEnd"), 1500);
    const end = accept(stream, lifecycle("MatchEnded"), 1600);
    expect(end.map((e) => e.Event)).toEqual(["UpdateState", "MatchEnded"]);
    expect((end[0].Data.Players as Player[])[0].Goals).toBe(3);
    expect(accept(stream, tick(), 2500)).toHaveLength(1);
  });
  it("recovers from a missed GoalReplayEnd on an explicit live tick", () => {
    const stream = new CollectorStream();
    accept(stream, tick());
    const replay = tick();
    (replay.Data.Game as Record<string, unknown>).bReplay = true;
    accept(stream, replay, 1200);
    const live = tick();
    (live.Data.Game as Record<string, unknown>).bReplay = false;
    expect(accept(stream, live, 2500)).toHaveLength(1);
  });
  it("keeps a history replay excluded even across its lifecycle and false replay flags", () => {
    const stream = new CollectorStream();
    accept(stream, tick());
    accept(stream, { Event: "ReplayCreated", Data: { MatchGuid: "history" } });
    for (const Event of [
      "MatchCreated",
      "RoundStarted",
      "MatchEnded",
      "PodiumStart",
    ])
      expect(accept(stream, { Event, Data: { MatchGuid: "history" } })).toEqual(
        [],
      );
    const replay = tick();
    replay.Data.MatchGuid = "history";
    (replay.Data.Game as Record<string, unknown>).bReplay = false;
    expect(accept(stream, replay)).toEqual([]);
    expect(
      accept(stream, {
        Event: "MatchDestroyed",
        Data: { MatchGuid: "history" },
      }),
    ).toEqual([]);
    expect(accept(stream, lifecycle("MatchCreated"))).toHaveLength(1);
  });
  it("does not carry player references or throttling into a different match", () => {
    const stream = new CollectorStream();
    accept(stream, tick(), 1000);
    const next = tick();
    next.Data.MatchGuid = "another";
    expect(accept(stream, next, 1001)).toHaveLength(1);
  });
});
describe("private diagnostic and storage boundaries", () => {
  it("bounds log volume even when malformed ticks contain many distinct field errors", () => {
    let now = 0;
    const write = vi.fn(),
      report = diagnosticLogger(write, () => now);
    for (let i = 0; i < 100; i++) report(`Field ${i}`);
    expect(write).toHaveBeenCalledTimes(20);
    now = 60000;
    report("next");
    expect(write.mock.calls[20][0]).toContain("80 weitere Diagnosen");
    expect(write.mock.calls[21][0]).toBe("next");
  });
  it("reports event, field, category and issue count without leaking error values or payloads", () => {
    const report = vi.fn(),
      stream = new CollectorStream((i) => report(formatIssue(i))),
      event = tick();
    (event.Data.Players as unknown[]).push({
      Name: "PRIVATE_NAME",
      PrimaryId: "PRIVATE_ID",
      TeamNum: "PRIVATE_TOKEN",
    });
    receive(JSON.stringify(event), stream, [member], () => {}, report);
    const output = JSON.stringify(report.mock.calls);
    expect(output).toContain("UpdateState");
    expect(output).toContain("Data.Players.4.PrimaryId");
    expect(output).toContain("2 Fehler");
    expect(output).not.toContain("PRIVATE");
  });
  it("redacts malicious record keys, unknown event names and SyntaxError excerpts", () => {
    const bad = JSON.stringify({
      Event: "PRIVATE_EVENT",
      Data: { PRIVATE_KEY: "PRIVATE_TOKEN" },
    });
    const error = new z.ZodError([
      {
        code: "custom",
        path: ["Data", "PRIVATE_KEY"],
        message: "PRIVATE_MESSAGE",
      },
    ]);
    expect(parserFailure(bad, error)).toContain("Unbekannt");
    expect(parserFailure(bad, error)).not.toContain("PRIVATE");
    expect(
      parserFailure("{PRIVATE_TOKEN", new SyntaxError("PRIVATE_TOKEN")),
    ).not.toContain("PRIVATE");
  });
  it("separates invalid JSON from outbox capacity and storage errors and continues", () => {
    const report = vi.fn(),
      put = vi.fn(),
      stream = new CollectorStream();
    receive("{PRIVATE", stream, [member], put, report);
    expect(put).not.toHaveBeenCalled();
    expect(report.mock.calls[0][0]).toContain("JSON");
    receive(
      JSON.stringify(lifecycle("MatchCreated")),
      stream,
      [member],
      () => {
        throw new OutboxFullError();
      },
      report,
    );
    expect(report.mock.calls[1][0]).toContain("Kapazitätsgrenze");
    receive(
      JSON.stringify(lifecycle("MatchCreated")),
      stream,
      [member],
      () => {
        throw new Error("PRIVATE_DB_PATH");
      },
      report,
    );
    expect(report.mock.calls[2][0]).toContain("SQLite-/Speicherfehler");
    expect(JSON.stringify(report.mock.calls)).not.toContain("PRIVATE");
    receive(JSON.stringify(tick()), stream, [member], put, report);
    expect(put).toHaveBeenCalledOnce();
  });
  it("coalesces repeated errors and reports the suppressed count", () => {
    let time = 0;
    const log = vi.fn(),
      report = diagnosticLogger(log, () => time);
    report("Schema");
    for (let i = 0; i < 10; i++) report("Schema");
    expect(log).toHaveBeenCalledOnce();
    time = 60000;
    report("Schema");
    expect(log.mock.calls[1][0]).toContain("10 gleiche Meldungen");
  });
});
describe("independent collector heartbeat", () => {
  it("reports connection changes and current queue depth, retrying failure independently", async () => {
    let now = 0;
    const status: CollectorStatus = {
        gameConnected: false,
        queueDepth: 3,
        version: "0.1.1",
      },
      sent: CollectorStatus[] = [];
    const send = vi.fn(async (s: CollectorStatus) => {
        sent.push({ ...s });
      }),
      failed = vi.fn();
    const heartbeat = new Heartbeat(
      () => ({ ...status }),
      send,
      failed,
      () => now,
    );
    await heartbeat.tick();
    status.gameConnected = true;
    await heartbeat.tick();
    expect(sent.map((s) => s.gameConnected)).toEqual([false, true]);
    await heartbeat.tick();
    expect(send).toHaveBeenCalledTimes(2);
    now = 60000;
    status.queueDepth = 7;
    send.mockRejectedValueOnce(new Error("offline"));
    await heartbeat.tick();
    expect(failed).toHaveBeenCalledOnce();
    now = 65000;
    await heartbeat.tick();
    expect(sent.at(-1)).toEqual({ ...status });
    status.gameConnected = false;
    await heartbeat.tick();
    expect(sent.at(-1)?.gameConnected).toBe(false);
  });
  it("avoids concurrent sends while an earlier heartbeat is pending", async () => {
    let resolve!: () => void;
    const send = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const heartbeat = new Heartbeat(
      () => ({ gameConnected: true, queueDepth: 0, version: "0.1.1" }),
      send,
      () => {},
    );
    const pending = heartbeat.tick();
    await heartbeat.tick();
    expect(send).toHaveBeenCalledOnce();
    resolve();
    await pending;
  });
});
