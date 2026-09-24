import { type MatchState, type Envelope } from "../shared/model.js";
import {
  statePlayers,
  gameOf,
  mergePlayer,
} from "../rocket-league-api/parser.js";
const phases: Record<string, number> = {
  WAITING: 0,
  MATCH_CREATED: 1,
  INITIALIZED: 2,
  ACTIVE: 3,
  ENDED: 4,
  PODIUM: 5,
  DESTROYED: 6,
};
export function advance(
  previous: MatchState | undefined,
  event: Envelope,
  at: string,
): MatchState {
  const s: MatchState = structuredClone(
    previous ?? {
      phase: "WAITING",
      quality: "partial",
      status: "unknown",
      startedAt: at,
      players: {},
      game: {},
      sawStart: false,
      sawEnd: false,
      updatedAt: at,
    },
  );
  const transitions: Record<string, string> = {
    MatchCreated: "MATCH_CREATED",
    MatchInitialized: "INITIALIZED",
    RoundStarted: "ACTIVE",
    UpdateState: "ACTIVE",
    MatchEnded: "ENDED",
    PodiumStart: "PODIUM",
    MatchDestroyed: "DESTROYED",
  };
  const phase = transitions[event.Event];
  if (phase && phases[phase] > phases[s.phase]) s.phase = phase;
  if (["MatchCreated", "MatchInitialized"].includes(event.Event)) {
    s.sawStart = true;
    s.startedAt = at < s.startedAt ? at : s.startedAt;
  }
  if (event.Event === "UpdateState") {
    for (const p of statePlayers(event))
      s.players[p.PrimaryId] = mergePlayer(s.players[p.PrimaryId], p);
    const game = gameOf(event);
    // Scoreboards are monotonic; a delayed second collector cannot roll scores back.
    const teams = new Map(s.game.Teams?.map((t) => [t.TeamNum, t]) ?? []);
    if (game.Teams) {
      for (const t of game.Teams)
        teams.set(t.TeamNum, {
          ...t,
          Score: Math.max(t.Score, teams.get(t.TeamNum)?.Score ?? 0),
        });
      game.Teams = [...teams.values()];
    }
    const overtime =
      s.game.bOvertime === true || game.bOvertime === true
        ? true
        : (game.bOvertime ?? s.game.bOvertime);
    s.game = {
      ...s.game,
      ...game,
      ...(overtime === undefined ? {} : { bOvertime: overtime }),
    };
    if (game.bHasWinner && ["Blue", "Orange"].includes(game.Winner ?? ""))
      s.winner = game.Winner === "Blue" ? 0 : 1;
  }
  if (event.Event === "MatchEnded") {
    s.sawEnd = true;
    s.endedAt = s.endedAt && s.endedAt < at ? s.endedAt : at;
    if (event.Data.WinnerTeamNum === 0 || event.Data.WinnerTeamNum === 1)
      s.winner = event.Data.WinnerTeamNum;
  }
  if (event.Event === "MatchDestroyed" && !s.endedAt) s.endedAt = at;
  s.updatedAt = at > s.updatedAt ? at : s.updatedAt;
  if (s.sawEnd) {
    s.status = "complete";
    s.quality = s.sawStart ? "complete" : "partial";
  } else if (s.phase === "DESTROYED") {
    s.status = Object.keys(s.players).length ? "partial" : "aborted";
    s.quality = Object.keys(s.players).length ? "recovered" : "invalid";
  }
  return s;
}
