import { DateTime } from "luxon";
import {
  metrics,
  type Player,
  type MatchState,
  type GuildConfig,
  type Member,
} from "../shared/model.js";
export type Observation = {
  member_id: string;
  stats: Player;
  state: MatchState;
  match_id: string;
};
export type Filter = {
  period?: string;
  playlist?: number;
  memberId?: string;
  from?: string;
  to?: string;
  teamMembers?: string[];
};
export function range(
  filter: Filter,
  config: GuildConfig,
  now: DateTime = DateTime.now(),
) {
  const local = now.setZone(config.timezone);
  let from: DateTime | undefined, to: DateTime | undefined;
  switch (filter.period) {
    case "today":
      from = local.startOf("day");
      break;
    case "yesterday":
      from = local.minus({ days: 1 }).startOf("day");
      to = local.startOf("day");
      break;
    case "week":
      from = local.startOf("week");
      break;
    case "month":
      from = local.startOf("month");
      break;
    case "7days":
      from = local.minus({ days: 7 });
      break;
    case "30days":
      from = local.minus({ days: 30 });
      break;
    case "season":
      if (config.seasonStart) from = DateTime.fromISO(config.seasonStart);
      else throw new Error("Saisonbeginn ist noch nicht konfiguriert.");
      break;
    case "custom":
      from = DateTime.fromISO(filter.from ?? "", { zone: config.timezone });
      to = DateTime.fromISO(filter.to ?? "", { zone: config.timezone });
      if (!from.isValid || !to.isValid)
        throw new Error("Gültigen Zeitraum angeben.");
  }
  return {
    from: from?.toMillis() ?? -Infinity,
    to: to?.toMillis() ?? Infinity,
  };
}
export function select(rows: Observation[], f: Filter, c: GuildConfig) {
  const { from, to } = range(f, c);
  return rows.filter((r) => {
    const time = Date.parse(r.state.startedAt);
    if (
      time < from ||
      time >= to ||
      (f.memberId && r.member_id !== f.memberId) ||
      (f.playlist !== undefined && r.state.game.PlaylistId !== f.playlist)
    )
      return false;
    if (
      f.teamMembers?.length &&
      !f.teamMembers.every((id) =>
        rows.some(
          (x) =>
            x.match_id === r.match_id &&
            x.member_id === id &&
            x.stats.TeamNum === r.stats.TeamNum,
        ),
      )
    )
      return false;
    return true;
  });
}
export function aggregate(rows: Observation[]) {
  let wins = 0,
    losses = 0,
    winStreak = 0,
    lossStreak = 0,
    bestWinStreak = 0,
    otWins = 0,
    otLosses = 0;
  const totals: Record<string, number | null> = {};
  const coverage: Record<string, number> = {};
  for (const k of metrics) {
    const values = rows
      .map((r) => r.stats[k])
      .filter((v): v is number => v !== undefined);
    totals[k] = values.length ? values.reduce((a, b) => a + b, 0) : null;
    coverage[k] = values.length;
  }
  for (const r of rows) {
    if (r.state.winner === undefined) {
      winStreak = 0;
      lossStreak = 0;
      continue;
    }
    const win = r.stats.TeamNum === r.state.winner;
    if (win) {
      wins++;
      winStreak++;
      lossStreak = 0;
      bestWinStreak = Math.max(bestWinStreak, winStreak);
      if (r.state.game.bOvertime) otWins++;
    } else {
      losses++;
      lossStreak++;
      winStreak = 0;
      if (r.state.game.bOvertime) otLosses++;
    }
  }
  const matches = rows.length;
  const personal = new Set(rows.map((r) => r.member_id)).size <= 1;
  const shootingRows = rows.filter(
    (r) => r.stats.Goals !== undefined && r.stats.Shots !== undefined,
  );
  const shootingGoals = shootingRows.reduce((n, r) => n + r.stats.Goals!, 0),
    shootingShots = shootingRows.reduce((n, r) => n + r.stats.Shots!, 0);
  return {
    matches,
    wins,
    losses,
    unknown: matches - wins - losses,
    winrate: wins + losses ? (wins / (wins + losses)) * 100 : null,
    totals,
    coverage,
    perMatch: Object.fromEntries(
      metrics.map((k) => [
        k,
        totals[k] === null ? null : Number(totals[k]) / coverage[k],
      ]),
    ),
    shooting: shootingShots ? (shootingGoals / shootingShots) * 100 : null,
    winStreak: personal ? winStreak : null,
    lossStreak: personal ? lossStreak : null,
    bestWinStreak: personal ? bestWinStreak : null,
    overtimeMatches: rows.filter((r) => r.state.game.bOvertime).length,
    otWins,
    otLosses,
  };
}
export function sessions(rows: Observation[], timeout: number) {
  const matches = [...new Map(rows.map((r) => [r.match_id, r])).values()].sort(
    (a, b) => a.state.startedAt.localeCompare(b.state.startedAt),
  );
  const groups: { start: string; end: string; matchIds: string[] }[] = [];
  for (const row of matches) {
    const end = row.state.endedAt ?? row.state.updatedAt;
    const last = groups.at(-1);
    if (
      last &&
      Date.parse(row.state.startedAt) - Date.parse(last.end) <= timeout * 60000
    ) {
      last.end = end > last.end ? end : last.end;
      last.matchIds.push(row.match_id);
    } else
      groups.push({
        start: row.state.startedAt,
        end,
        matchIds: [row.match_id],
      });
  }
  return groups.map((g) => ({
    ...g,
    active: Date.now() - Date.parse(g.end) < timeout * 60000,
    matches: g.matchIds.length,
    stats: aggregate(rows.filter((r) => g.matchIds.includes(r.match_id))),
  }));
}
export function records(rows: Observation[], members: Member[]) {
  return metrics.flatMap((metric) => {
    const valid = rows.filter((r) => r.stats[metric] !== undefined);
    if (!valid.length) return [];
    const best = valid.reduce((a, b) =>
      Number(a.stats[metric]) >= Number(b.stats[metric]) ? a : b,
    );
    return [
      {
        metric,
        value: best.stats[metric],
        memberId: best.member_id,
        member:
          members.find((m) => m.id === best.member_id)?.display_name ??
          "Gelöscht",
        matchId: best.match_id,
        automatic: true,
      },
    ];
  });
}
export function leaderboard(
  rows: Observation[],
  members: Member[],
  metric: string,
  minimum: number,
) {
  return members
    .map((m) => {
      const a = aggregate(rows.filter((r) => r.member_id === m.id));
      const value =
        metric === "winrate"
          ? a.matches >= minimum
            ? a.winrate
            : null
          : metric === "matches"
            ? a.matches
            : metric === "wins"
              ? a.wins
              : metric === "streak"
                ? a.bestWinStreak
                : (a.totals[metric] ?? null);
      return {
        member: m.display_name,
        memberId: m.id,
        value,
        matches: a.matches,
      };
    })
    .filter((r) => r.value !== null)
    .sort((a, b) => Number(b.value) - Number(a.value));
}
