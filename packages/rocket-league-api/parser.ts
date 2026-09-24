import { z } from "zod";
import {
  envelope,
  playerSchema,
  metrics,
  type Envelope,
  type Player,
  type Member,
  type Game,
} from "../shared/model.js";
import { type IssueReporter } from "./diagnostics.js";
export const knownEvents = new Set(
  "UpdateState BallHit BoostPickup ClockUpdatedSeconds CountdownBegin CrossbarHit GoalReplayEnd GoalReplayStart GoalReplayWillEnd GoalScored MatchCreated MatchDestroyed MatchEnded MatchInitialized MatchPaused MatchUnpaused PlayerJoined PlayerLeft PodiumStart ReplayCreated RoundStarted StatfeedEvent".split(
    " ",
  ),
);
const teamSchema = z.object({
  TeamNum: z.number().int(),
  Score: z.number().int().nonnegative(),
});
const gameSchema = z.object({
  Teams: z.array(teamSchema).max(8).optional(),
  PlaylistId: z.number().int().optional(),
  TimeSeconds: z.number().finite().optional(),
  bOvertime: z.boolean().optional(),
  bHasWinner: z.boolean().optional(),
  Winner: z.string().max(128).optional(),
  Arena: z.string().max(128).optional(),
  bReplay: z.boolean().optional(),
});
export function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
/** The wire protocol also sends Data as one JSON-encoded object. Never decode recursively. */
export function parse(input: unknown): Envelope {
  const raw: unknown = typeof input === "string" ? JSON.parse(input) : input;
  if (!plainObject(raw)) return envelope.parse(raw);
  let data: unknown = raw.Data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = undefined;
    }
  }
  return envelope.parse({
    Event: raw.Event,
    Data: plainObject(data) ? data : undefined,
  });
}
export function eligible(p: Player, members: Member[]) {
  const active = members.filter((m) => m.active);
  if (active.some((m) => m.identities.includes(p.PrimaryId))) return true;
  const matches = active.filter(
    (m) =>
      m.pending_name === p.Name &&
      m.pending_platform === p.PrimaryId.split("|")[0],
  );
  return matches.length === 1;
}
/** Allowlist projection BEFORE disk: arbitrary future fields and unregistered names never persist. */
export function sanitize(
  event: Envelope,
  members: Member[],
  observed: Player[] = [],
  report?: IssueReporter,
  blockedReferences: Set<string> = new Set(),
): Envelope {
  const raw = event.Data;
  const Data: Record<string, unknown> = {};
  const guid = matchGuid(event);
  if (!guid) return { Event: event.Event, Data };
  Data.MatchGuid = guid;
  if (event.Event === "UpdateState") {
    const players = statePlayers(event, report);
    const invalid = invalidPlayers(event);
    Data.Players = players.filter(
      (p) =>
        eligible(p, members) &&
        (members.some((m) => m.active && m.identities.includes(p.PrimaryId)) ||
          !invalid.some(
            (r) =>
              r.Name === p.Name &&
              (typeof r.PrimaryId !== "string" ||
                !r.PrimaryId.includes("|") ||
                r.PrimaryId.split("|")[0] === p.PrimaryId.split("|")[0]),
          )),
    );
    Data.Game = gameOf(event, report);
  }
  function ref(value: unknown): unknown {
    if (!value || typeof value !== "object") return undefined;
    const r = value as Record<string, unknown>;
    const candidates = observed.filter((p) =>
      typeof r.PrimaryId === "string"
        ? p.PrimaryId === r.PrimaryId
        : p.Name === r.Name &&
          p.TeamNum === r.TeamNum &&
          (r.Shortcut === undefined || p.Shortcut === r.Shortcut),
    );
    if (
      candidates.length !== 1 ||
      blockedReferences.has(candidates[0].PrimaryId) ||
      !eligible(candidates[0], members)
    )
      return undefined;
    const p = candidates[0];
    return { PrimaryId: p.PrimaryId, Name: p.Name, TeamNum: p.TeamNum };
  }
  for (const key of [
    "Scorer",
    "Assister",
    "MainTarget",
    "SecondaryTarget",
    "Player",
  ]) {
    const value = ref(raw[key]);
    if (value) Data[key] = value;
  }
  if (event.Event === "BallHit" && Array.isArray(raw.Players))
    Data.Players = raw.Players.map(ref).filter(Boolean);
  for (const key of [
    "WinnerTeamNum",
    "GoalSpeed",
    "GoalTime",
    "TimeSeconds",
    "BoostAmount",
    "BallSpeed",
    "ImpactForce",
  ])
    if (typeof raw[key] === "number" && Number.isFinite(raw[key]))
      Data[key] = raw[key];
  for (const key of ["bOvertime", "bReplay"])
    if (typeof raw[key] === "boolean") Data[key] = raw[key];
  for (const key of ["EventName", "Type", "BoostType"])
    if (typeof raw[key] === "string")
      Data[key] = (raw[key] as string).slice(0, 100);
  const vector = z.object({
    X: z.number().finite(),
    Y: z.number().finite(),
    Z: z.number().finite(),
  });
  for (const key of ["ImpactLocation", "Location", "BallLocation"]) {
    const v = vector.safeParse(raw[key]);
    if (v.success) Data[key] = v.data;
  }
  if (raw.Ball && typeof raw.Ball === "object") {
    const ball = raw.Ball as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of ["PreHitSpeed", "PostHitSpeed"])
      if (typeof ball[k] === "number" && Number.isFinite(ball[k]))
        out[k] = ball[k];
    const loc = vector.safeParse(ball.Location);
    if (loc.success) out.Location = loc.data;
    Data.Ball = out;
  }
  if (raw.BallLastTouch && typeof raw.BallLastTouch === "object") {
    const b = raw.BallLastTouch as Record<string, unknown>;
    const p = ref(b.Player);
    if (p)
      Data.BallLastTouch = {
        Player: p,
        ...(typeof b.Speed === "number" && Number.isFinite(b.Speed)
          ? { Speed: b.Speed }
          : {}),
      };
  }
  if (["PlayerJoined", "PlayerLeft"].includes(event.Event)) {
    const p = observed.find(
      (p) => p.PrimaryId === raw.PrimaryId && eligible(p, members),
    );
    if (p) {
      Data.PrimaryId = p.PrimaryId;
      Data.PlayerName = p.Name;
    }
  }
  return { Event: event.Event, Data };
}
export function matchGuid(event: Envelope): string | undefined {
  const value = event.Data.MatchGuid;
  return typeof value === "string" &&
    value.length <= 128 &&
    value.trim().length > 0
    ? value
    : undefined;
}
function invalidPlayers(event: Envelope): Record<string, unknown>[] {
  if (event.Event !== "UpdateState" || !Array.isArray(event.Data.Players))
    return [];
  return event.Data.Players.slice(0, 64).filter(
    (raw): raw is Record<string, unknown> =>
      !!raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      !playerSchema.safeParse(raw).success,
  );
}
/** Invalid peers still prevent name-only reference guessing; hints remain in RAM only. */
export function ambiguousReferences(
  event: Envelope,
  players: Player[],
): Set<string> {
  const invalid = invalidPlayers(event);
  return new Set(
    players
      .filter((p) =>
        invalid.some(
          (r) =>
            r.PrimaryId === p.PrimaryId ||
            (r.Name === p.Name &&
              (r.TeamNum === undefined || r.TeamNum === p.TeamNum) &&
              (r.Shortcut === undefined || r.Shortcut === p.Shortcut)),
        ),
      )
      .map((p) => p.PrimaryId),
  );
}
export function statePlayers(
  event: Envelope,
  report?: IssueReporter,
): Player[] {
  if (event.Event !== "UpdateState" || !matchGuid(event)) return [];
  const array = z.array(z.unknown()).max(64).safeParse(event.Data.Players);
  if (!array.success)
    throw new z.ZodError(
      array.error.issues.map((issue) => ({
        ...issue,
        path: ["Data", "Players", ...issue.path],
      })),
    );
  const players: Player[] = [];
  array.data.forEach((raw, index) => {
    const player = playerSchema.safeParse(raw);
    if (player.success) players.push(player.data as Player);
    else
      report?.({
        event: event.Event,
        scope: "player",
        path: ["Data", "Players", index],
        issues: player.error.issues,
      });
  });
  return players;
}
export function mergePlayer(old: Player | undefined, next: Player): Player {
  const merged = { ...old, ...next };
  for (const k of metrics) {
    const a = old?.[k],
      b = next[k];
    if (a !== undefined && b !== undefined) merged[k] = Math.max(a, b);
  }
  return merged;
}
export function gameOf(event: Envelope, report?: IssueReporter): Game {
  if (event.Data.Game === undefined) return {};
  const object = z.record(z.string(), z.unknown()).safeParse(event.Data.Game);
  if (!object.success) {
    report?.({
      event: event.Event,
      scope: "game",
      path: ["Data", "Game"],
      issues: object.error.issues,
    });
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(gameSchema.shape)) {
    if (object.data[key] === undefined) continue;
    const value = schema.safeParse(object.data[key]);
    if (value.success) out[key] = value.data;
    else {
      report?.({
        event: event.Event,
        scope: "game",
        path: ["Data", "Game", key],
        issues: value.error.issues,
      });
      // A malformed team must not erase the other team's valid score.
      if (
        key === "Teams" &&
        Array.isArray(object.data.Teams) &&
        object.data.Teams.length <= 8
      ) {
        const valid = object.data.Teams.flatMap((raw) => {
          const team = teamSchema.safeParse(raw);
          return team.success ? [team.data] : [];
        });
        if (valid.length) out.Teams = valid;
      }
    }
  }
  return out as Game;
}
