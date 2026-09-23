import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { type Database, type Query } from "../database/db.js";
import { roster } from "../database/repository.js";
import {
  configSchema,
  type Player,
  type GuildConfig,
} from "../shared/model.js";
import { canonical, hash } from "../shared/crypto.js";
import { aggregate, select, sessions, type Observation } from "./stats.js";
import {
  advancedRecords,
  type EventRow,
  type AutomaticRecord,
} from "./analytics.js";
async function queue(
  q: Query,
  guild: string,
  key: string,
  kind: string,
  payload: unknown,
) {
  await q.query(
    "INSERT INTO notifications(id,guild_id,key,kind,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [randomUUID(), guild, key, kind, JSON.stringify(payload)],
  );
}
export async function reconcile(db: Database) {
  for (const guild of await db.query<{ id: string }>("SELECT id FROM guilds"))
    await db.transaction(async (q) => {
      const cfg = configSchema.parse(
        (
          await q.query<{ config: GuildConfig }>(
            "SELECT config FROM guilds WHERE id=$1 FOR UPDATE",
            [guild.id],
          )
        )[0].config,
      );
      const members = await roster(q, guild.id);
      const rows = await q.query<Observation>(
        `SELECT mm.member_id,mm.stats,m.state,m.id match_id FROM match_members mm JOIN matches m ON m.id=mm.match_id WHERE m.guild_id=$1 AND m.ended_at IS NOT NULL AND m.updated_at<now()-interval '10 seconds' ORDER BY m.started_at`,
        [guild.id],
      );
      const events = await q.query<EventRow>(
        "SELECT e.match_id,e.type,e.data FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.guild_id=$1",
        [guild.id],
      );
      const newRecords: (AutomaticRecord & { previous: number | null })[] = [];
      for (const r of advancedRecords(rows, members, events, cfg)) {
        const old = (
          await q.query<{ value: number }>(
            "SELECT value FROM automatic_records WHERE guild_id=$1 AND metric=$2",
            [guild.id, r.metric],
          )
        )[0];
        if (!old || Number(old.value) < r.value) {
          await q.query(
            "INSERT INTO automatic_records(guild_id,metric,member_id,match_id,value,unit) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,metric) DO UPDATE SET member_id=excluded.member_id,match_id=excluded.match_id,value=excluded.value,unit=excluded.unit,updated_at=now()",
            [guild.id, r.metric, r.memberId, r.matchId, r.value, r.unit],
          );
          if (r.value > 0)
            newRecords.push({ ...r, previous: old ? Number(old.value) : null });
        }
      }
      if (cfg.recordPosts && newRecords.length)
        await queue(
          q,
          guild.id,
          `records:${hash(canonical(newRecords))}`,
          "record",
          { records: newRecords },
        );
      const awarded: {
        memberId: string;
        member: string;
        achievement: string;
      }[] = [];
      for (const member of members) {
        const personal = rows.filter((r) => r.member_id === member.id),
          a = aggregate(personal);
        for (const r of advancedRecords(personal, [member], events, cfg))
          await q.query(
            "INSERT INTO personal_records(member_id,metric,match_id,value,unit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(member_id,metric) DO UPDATE SET match_id=excluded.match_id,value=excluded.value,unit=excluded.unit WHERE personal_records.value<excluded.value",
            [member.id, r.metric, r.matchId, r.value, r.unit],
          );
        if (!cfg.achievements) continue;
        for (const rule of cfg.achievementRules) {
          if (cfg.disabledAchievements.includes(rule.key)) continue;
          const together = new Set(
            personal
              .filter((p) =>
                rows.some(
                  (other) =>
                    other.match_id === p.match_id &&
                    other.member_id !== member.id &&
                    other.stats.TeamNum === p.stats.TeamNum,
                ),
              )
              .map((r) => r.match_id),
          ).size;
          const value =
            rule.kind === "wins"
              ? a.wins
              : rule.kind === "overtime_wins"
                ? a.otWins
                : rule.kind === "streak"
                  ? Number(a.bestWinStreak)
                  : rule.kind === "together"
                    ? together
                    : rule.kind === "total" && rule.metric
                      ? Number(a.totals[rule.metric])
                      : rule.kind === "match" && rule.metric
                        ? Math.max(
                            0,
                            ...personal.map((p) =>
                              Number(p.stats[rule.metric!] ?? 0),
                            ),
                          )
                        : 0;
          if (value < rule.threshold) continue;
          const inserted = await q.query(
            "INSERT INTO achievements(member_id,key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING key",
            [member.id, rule.key],
          );
          if (inserted.length)
            awarded.push({
              memberId: member.id,
              member: member.display_name,
              achievement: rule.label,
            });
        }
      }
      if (awarded.length)
        await queue(
          q,
          guild.id,
          `achievements:${hash(canonical(awarded))}`,
          "achievement",
          { awarded },
        );
      if (cfg.sessionPosts)
        for (const s of sessions(rows, cfg.sessionTimeout).filter(
          (s) => !s.active,
        ))
          await queue(q, guild.id, `session:${s.start}`, "session", {
            start: s.start,
            end: s.end,
            matches: s.matches,
            memberResults: s.stats,
          });
      const now = DateTime.now().setZone(cfg.timezone);
      for (const [enabled, unit] of [
        [cfg.dailyRecap, "day"],
        [cfg.weeklyRecap, "week"],
        [cfg.monthlyRecap, "month"],
      ] as const) {
        if (!enabled) continue;
        const end = now.startOf(unit),
          start = end.minus({ [unit + "s"]: 1 });
        const selected = select(
          rows,
          { period: "custom", from: start.toISO()!, to: end.toISO()! },
          cfg,
        );
        if (selected.length)
          await queue(q, guild.id, `${unit}:${start.toISODate()}`, "recap", {
            period: unit,
            from: start.toISODate(),
            to: end.toISODate(),
            serverMatches: new Set(selected.map((r) => r.match_id)).size,
            memberResults: aggregate(selected),
          });
      }
      await q.query(
        "DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE guild_id=$1) AND occurred_at<now()-($2::text || ' days')::interval",
        [guild.id, cfg.retentionDays],
      );
      await q.query(
        "DELETE FROM audit_log WHERE guild_id=$1 AND created_at<now()-($2::text || ' days')::interval",
        [guild.id, cfg.retentionDays],
      );
    });
}
export function observedEventStats(
  events: { type: string; data: Record<string, unknown> }[],
  primaryIds: Set<string>,
) {
  const speeds: number[] = [],
    hits: number[] = [];
  for (const e of events) {
    if (
      e.type === "GoalScored" &&
      primaryIds.has((e.data.Scorer as Player | undefined)?.PrimaryId ?? "") &&
      typeof e.data.GoalSpeed === "number"
    )
      speeds.push(e.data.GoalSpeed);
    if (
      e.type === "BallHit" &&
      Array.isArray(e.data.Players) &&
      e.data.Players.some((p) => primaryIds.has((p as Player).PrimaryId))
    ) {
      const ball = e.data.Ball as { PostHitSpeed?: number } | undefined;
      if (typeof ball?.PostHitSpeed === "number") hits.push(ball.PostHitSpeed);
    }
  }
  return {
    rawUnit: "Unreal Units/second",
    convertedValue: null,
    conversionVersion: null,
    observedGoals: speeds.length,
    fastestGoal: speeds.length ? Math.max(...speeds) : null,
    averageGoalSpeed: speeds.length
      ? speeds.reduce((a, b) => a + b, 0) / speeds.length
      : null,
    observedBallHits: hits.length,
    strongestBallHit: hits.length ? Math.max(...hits) : null,
    averageHitSpeed: hits.length
      ? hits.reduce((a, b) => a + b, 0) / hits.length
      : null,
  };
}
