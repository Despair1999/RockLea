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
export const knownEvents = new Set(
  "UpdateState BallHit BoostPickup ClockUpdatedSeconds CountdownBegin CrossbarHit GoalReplayEnd GoalReplayStart GoalReplayWillEnd GoalScored MatchCreated MatchDestroyed MatchEnded MatchInitialized MatchPaused MatchUnpaused PlayerJoined PlayerLeft PodiumStart ReplayCreated RoundStarted StatfeedEvent".split(
    " ",
  ),
);
const gameSchema = z.object({
  Teams: z
    .array(
      z.object({
        TeamNum: z.number().int(),
        Score: z.number().int().nonnegative(),
      }),
    )
    .max(8)
    .optional(),
  PlaylistId: z.number().int().optional(),
  TimeSeconds: z.number().finite().optional(),
  bOvertime: z.boolean().optional(),
  bHasWinner: z.boolean().optional(),
  Winner: z.enum(["Blue", "Orange", ""]).optional(),
  Arena: z.string().max(128).optional(),
  bReplay: z.boolean().optional(),
});
export function parse(input: unknown): Envelope {
  return envelope.parse(typeof input === "string" ? JSON.parse(input) : input);
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
): Envelope {
  const raw = event.Data;
  const Data: Record<string, unknown> = {};
  if (typeof raw.MatchGuid === "string" && raw.MatchGuid.length <= 128)
    Data.MatchGuid = raw.MatchGuid;
  if (event.Event === "UpdateState") {
    const players = z
      .array(playerSchema)
      .max(64)
      .parse(raw.Players) as Player[];
    Data.Players = players.filter((p) => eligible(p, members));
    Data.Game = gameSchema.parse(raw.Game);
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
    if (candidates.length !== 1 || !eligible(candidates[0], members))
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
export function statePlayers(event: Envelope): Player[] {
  return event.Event === "UpdateState"
    ? (z.array(playerSchema).max(64).parse(event.Data.Players) as Player[])
    : [];
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
export function gameOf(event: Envelope): Game {
  return gameSchema.parse(event.Data.Game);
}
