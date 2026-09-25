import { DateTime } from "luxon";
import { type GuildConfig, type Member, type Player } from "../shared/model.js";
import {
  aggregate,
  records,
  sessions,
  select,
  type Observation,
  type Filter,
} from "./stats.js";
export type EventRow = {
  match_id: string;
  type: string;
  data: Record<string, unknown>;
  occurred_at?: Date;
};
export type AutomaticRecord = {
  metric: string;
  value: number;
  memberId: string;
  member: string;
  matchId: string;
  automatic: true;
  unit: string;
  achievedAt: string;
};
export function advancedRecords(
  rows: Observation[],
  members: Member[],
  events: EventRow[],
  cfg: GuildConfig,
): AutomaticRecord[] {
  const results: AutomaticRecord[] = records(rows, members).map((r) => ({
    ...r,
    value: Number(r.value),
    automatic: true,
    unit: "count",
  }));
  for (const member of members) {
    const own = rows
      .filter((r) => r.member_id === member.id)
      .sort((a, b) => a.state.startedAt.localeCompare(b.state.startedAt));
    if (!own.length) continue;
    const identityIds = new Set(own.map((r) => r.stats.PrimaryId));
    const add = (
      metric: string,
      value: number,
      matchId: string,
      unit = "count",
      achievedAt?: string,
    ) =>
      results.push({
        metric,
        value,
        memberId: member.id,
        member: member.display_name,
        matchId,
        unit,
        achievedAt:
          achievedAt ??
          own.find((r) => r.match_id === matchId)?.state.endedAt ??
          own.find((r) => r.match_id === matchId)!.state.startedAt,
        automatic: true,
      });
    let streak = 0;
    for (const row of own) {
      streak =
        row.state.winner !== undefined && row.state.winner === row.stats.TeamNum
          ? streak + 1
          : 0;
      add("BestWinStreak", streak, row.match_id);
    }
    const days = new Map<string, Observation[]>();
    for (const row of own) {
      const day = DateTime.fromISO(row.state.startedAt)
        .setZone(cfg.timezone)
        .toISODate()!;
      days.set(day, [...(days.get(day) ?? []), row]);
    }
    for (const group of days.values()) {
      const daily = aggregate(group);
      let dailyWins = 0;
      for (const row of group) {
        if (
          row.state.winner !== undefined &&
          row.state.winner === row.stats.TeamNum
        )
          dailyWins++;
        add("DailyWins", dailyWins, row.match_id);
      }
      if (daily.matches >= cfg.minimumMatches && daily.winrate !== null)
        add("DailyWinrate", daily.winrate, group.at(-1)!.match_id, "%");
    }
    for (const s of sessions(own, cfg.sessionTimeout))
      add("SessionMatches", s.matches, s.matchIds.at(-1)!);
    const matchIds = new Set(own.map((r) => r.match_id));
    for (const e of events.filter((e) => matchIds.has(e.match_id))) {
      const scorer = e.data.Scorer as Player | undefined;
      if (
        e.type === "GoalScored" &&
        scorer &&
        identityIds.has(scorer.PrimaryId) &&
        typeof e.data.GoalSpeed === "number"
      )
        add(
          "FastestGoal",
          e.data.GoalSpeed,
          e.match_id,
          "Unreal Units/second",
          e.occurred_at?.toISOString(),
        );
      const ball = e.data.Ball as { PostHitSpeed?: number } | undefined;
      if (
        e.type === "BallHit" &&
        Array.isArray(e.data.Players) &&
        e.data.Players.some((p) => identityIds.has((p as Player).PrimaryId)) &&
        typeof ball?.PostHitSpeed === "number"
      )
        add(
          "StrongestBallHit",
          ball.PostHitSpeed,
          e.match_id,
          "Unreal Units/second",
          e.occurred_at?.toISOString(),
        );
    }
  }
  const best = new Map<string, AutomaticRecord>();
  for (const r of results) {
    if (!cfg.recordMetrics.includes(r.metric)) continue;
    const old = best.get(r.metric);
    if (
      !old ||
      r.value > old.value ||
      (r.value === old.value && r.achievedAt < old.achievedAt)
    )
      best.set(r.metric, r);
  }
  return [...best.values()];
}
export function teamStats(
  rows: Observation[],
  members: Member[],
  events: EventRow[],
  ids: string[],
  filter: Filter,
  cfg: GuildConfig,
) {
  if (ids.length < 2 || ids.length > 3 || new Set(ids).size !== ids.length)
    throw new Error(
      "Bitte zwei oder drei unterschiedliche Mitglieder auswählen.",
    );
  const together = select(
    rows,
    { ...filter, memberId: undefined, teamMembers: ids },
    cfg,
  ).filter((r) => ids.includes(r.member_id));
  const onePerMatch = [
    ...new Map(together.map((r) => [r.match_id, r])).values(),
  ];
  const summary = aggregate(onePerMatch);
  const matchIds = new Set(onePerMatch.map((r) => r.match_id));
  const primaryIds = new Set(together.map((r) => r.stats.PrimaryId));
  const observedMutualAssists = events.filter(
    (e) =>
      e.type === "GoalScored" &&
      matchIds.has(e.match_id) &&
      primaryIds.has((e.data.Scorer as Player | undefined)?.PrimaryId ?? "") &&
      primaryIds.has((e.data.Assister as Player | undefined)?.PrimaryId ?? ""),
  ).length;
  return {
    matches: summary.matches,
    wins: summary.wins,
    losses: summary.losses,
    winrate: summary.winrate,
    observedMutualAssists,
    members: ids.map((id) => ({
      member: members.find((m) => m.id === id)?.display_name ?? id,
      stats: aggregate(together.filter((r) => r.member_id === id)),
    })),
  };
}
export function relationships(players: Record<string, Player>) {
  const values = Object.values(players);
  return values.flatMap((a, i) =>
    values.slice(i + 1).map((b) => ({
      first: a.PrimaryId,
      second: b.PrimaryId,
      relationship: a.TeamNum === b.TeamNum ? "same_team" : "opponent",
    })),
  );
}
