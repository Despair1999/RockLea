import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Repository, audit } from "../database/repository.js";
import {
  aggregate,
  select,
  sessions,
  leaderboard,
  type Filter,
} from "../stats-engine/stats.js";
import { NullRatingProvider } from "../rating-providers/index.js";
import { configSchema } from "./model.js";
import { observedEventStats } from "../stats-engine/reconcile.js";
import {
  advancedRecords,
  teamStats,
  type EventRow,
} from "../stats-engine/analytics.js";
import { timeline, type SnapshotRow } from "../rating-providers/timeline.js";
export type Actor = { id: string; admin: boolean };
export const adminActions = new Set([
  "setup",
  "config.set",
  "member.add",
  "member.me",
  "member.edit",
  "member.enable",
  "member.disable",
  "member.remove",
  "member.link",
  "member.unlink",
  "member.verify",
  "collector.pair",
  "collector.rename",
  "collector.revoke",
  "record.approve",
  "record.reject",
  "record.edit",
  "record.delete",
  "mmr.set",
]);
const filterSchema = z.object({
  period: z
    .enum([
      "all",
      "today",
      "yesterday",
      "week",
      "month",
      "7days",
      "30days",
      "season",
      "custom",
    ])
    .optional(),
  playlist: z.coerce.number().int().optional(),
  memberId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  teamMembers: z.array(z.string().uuid()).optional(),
});
export async function action(
  repo: Repository,
  guild: string,
  actor: Actor,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  if (adminActions.has(name) && !actor.admin)
    throw new Error(
      "Dafür sind Server-verwalten-Rechte oder eine konfigurierte Admin-Rolle erforderlich.",
    );
  const str = (key: string) => z.string().min(1).max(2000).parse(args[key]);
  if (name === "setup") return repo.setup(guild, actor.id, args.config ?? {});
  if (name === "config.get") return repo.config(guild);
  if (name === "config.set") {
    const current = await repo.config(guild);
    return repo.setConfig(
      guild,
      actor.id,
      configSchema.parse({
        ...current,
        ...z.record(z.string(), z.unknown()).parse(args.config),
      }),
    );
  }
  if (name === "member.add") return repo.addMember(guild, actor.id, args);
  if (name === "member.me")
    return repo.addMember(guild, actor.id, {
      ...args,
      discordId: actor.id,
      displayName: args.name,
    });
  if (name === "member.detect")
    return {
      members: await repo.members(guild),
      candidates: repo.detected(guild),
    };
  if (name === "member.info") {
    const member = (await repo.members(guild)).find(
      (m) => m.id === args.id || m.discord_id === (args.discordId ?? actor.id),
    );
    if (!member) throw new Error("Mitglied nicht gefunden.");
    return {
      ...member,
      history: await repo.db.query(
        "SELECT h.* FROM name_history h JOIN identities i USING(guild_id,primary_id) WHERE i.member_id=$1",
        [member.id],
      ),
    };
  }
  if (name === "member.list") return repo.members(guild);
  if (
    name === "member.edit" ||
    name === "member.enable" ||
    name === "member.disable"
  )
    return repo.editMember(
      guild,
      actor.id,
      str("id"),
      name === "member.edit" ? args : { active: name === "member.enable" },
    );
  if (name === "member.link" || name === "member.verify")
    return repo.link(guild, actor.id, str("id"), str("primaryId"));
  if (name === "member.unlink")
    return repo.unlink(guild, actor.id, str("primaryId"));
  if (name === "member.remove")
    return repo.deleteMember(guild, actor.id, str("discordId"));
  if (name === "privacy.export") return repo.exportMember(guild, actor.id);
  if (name === "privacy.delete") {
    if (args.confirm !== true)
      throw new Error("Bitte die Löschung ausdrücklich bestätigen.");
    return repo.deleteMember(guild, actor.id, actor.id);
  }
  if (name === "collector.pair")
    return repo.pairCode(
      guild,
      actor.id,
      typeof args.discordId === "string" ? args.discordId : actor.id,
    );
  if (name === "collector.list" || name === "collector.status")
    return repo.collectors(guild);
  if (name === "collector.rename" || name === "collector.revoke")
    return repo.collectorEdit(
      guild,
      actor.id,
      str("id"),
      name === "collector.rename" ? { name: str("name") } : { revoked: true },
    );
  if (name === "match.history") return repo.matches(guild, 100);
  if (name === "match.latest") return (await repo.matches(guild, 1))[0] ?? null;
  if (name === "match.info") return repo.match(guild, str("id"));
  if (name === "status" || name === "health")
    return {
      database: (await repo.db.query("SELECT 1")).length === 1,
      collectors: await repo.collectors(guild),
      rating: new NullRatingProvider().getCapabilities(),
    };
  if (name === "mmr.set") {
    const v = z
      .object({
        memberId: z.string().uuid(),
        playlist: z.number().int(),
        mmr: z.number().min(0).max(10000),
        rank: z.string().max(80).optional(),
        division: z.string().max(20).optional(),
      })
      .parse(args);
    if (!(await repo.members(guild)).some((m) => m.id === v.memberId))
      throw new Error("Mitglied nicht gefunden.");
    await repo.db.transaction(async (q) => {
      await q.query(
        "INSERT INTO rating_snapshots(id,member_id,playlist_id,mmr,rank,division,source,confidence,measured_at) VALUES($1,$2,$3,$4,$5,$6,'manual','manual',now())",
        [
          randomUUID(),
          v.memberId,
          v.playlist,
          v.mmr,
          v.rank ?? null,
          v.division ?? null,
        ],
      );
      await audit(q, guild, actor.id, "rating.manual", {
        memberId: v.memberId,
        mmr: v.mmr,
      });
    });
    return { source: "manual", automatic: false };
  }
  if (name.startsWith("mmr") || name === "rank") {
    const members = await repo.members(guild);
    let snapshots = await repo.db.query<SnapshotRow>(
      "SELECT r.* FROM rating_snapshots r JOIN members m ON m.id=r.member_id WHERE m.guild_id=$1 ORDER BY measured_at DESC LIMIT 200",
      [guild],
    );
    if (args.discordId || args.otherDiscordId || args.memberId) {
      const ids = new Set(
        members
          .filter(
            (m) =>
              m.id === args.memberId ||
              [args.discordId, args.otherDiscordId].includes(m.discord_id),
          )
          .map((m) => m.id),
      );
      snapshots = snapshots.filter((s) => ids.has(s.member_id));
    }
    if (args.playlist !== undefined)
      snapshots = snapshots.filter(
        (s) => s.playlist_id === Number(args.playlist),
      );
    const history = timeline(snapshots, await repo.observations(guild));
    return { provider: new NullRatingProvider().getCapabilities(), ...history };
  }
  if (name === "record.submit") {
    const v = z
      .object({
        category: z.string().min(1).max(80),
        value: z.number().finite().nonnegative(),
        unit: z.string().min(1).max(24),
        evidence: z.string().url().max(1000).optional(),
        description: z.string().max(1000).optional(),
      })
      .parse(args);
    const member = (await repo.members(guild)).find(
      (m) => m.discord_id === actor.id,
    );
    if (!member) throw new Error("Bitte zuerst als Mitglied registrieren.");
    const id = randomUUID();
    await repo.db.query(
      "INSERT INTO manual_records(id,guild_id,member_id,category,value,unit,evidence,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        guild,
        member.id,
        v.category,
        v.value,
        v.unit,
        v.evidence ?? null,
        v.description ?? null,
      ],
    );
    return { id, status: "pending" };
  }
  if (
    [
      "record.approve",
      "record.reject",
      "record.delete",
      "record.edit",
    ].includes(name)
  ) {
    await repo.db.transaction(async (q) => {
      if (name === "record.delete")
        await q.query(
          "DELETE FROM manual_records WHERE guild_id=$1 AND id=$2",
          [guild, str("id")],
        );
      else if (name === "record.edit")
        await q.query(
          "UPDATE manual_records SET value=$3,status='pending' WHERE guild_id=$1 AND id=$2",
          [guild, str("id"), z.number().nonnegative().parse(args.value)],
        );
      else
        await q.query(
          "UPDATE manual_records SET status=$3,reviewer=$4 WHERE guild_id=$1 AND id=$2",
          [
            guild,
            str("id"),
            name === "record.approve" ? "approved" : "rejected",
            actor.id,
          ],
        );
      await audit(q, guild, actor.id, name, { id: str("id") });
    });
    return { saved: true };
  }
  const cfg = await repo.config(guild);
  const members = await repo.members(guild);
  const filter: Filter = filterSchema.parse(args);
  if (args.discordId && !["stats.compare", "stats.team"].includes(name))
    filter.memberId =
      members.find((m) => m.discord_id === args.discordId)?.id ?? "missing";
  const allRows = await repo.observations(guild);
  const rows = select(allRows, filter, cfg);
  if (name === "stats.boards")
    return members
      .filter((m) => m.active)
      .map((m) => ({
        memberId: m.id,
        member: m.display_name,
        stats: aggregate(rows.filter((r) => r.member_id === m.id)),
      }));
  if (name === "stats.team") {
    const chosen = args.teamMembers
      ? z.array(z.string().uuid()).parse(args.teamMembers)
      : [args.discordId, args.otherDiscordId, args.thirdDiscordId]
          .filter(Boolean)
          .map((d) => members.find((m) => m.discord_id === d)?.id ?? "missing");
    const events = await repo.db.query<EventRow>(
      "SELECT e.match_id,e.type,e.data,e.occurred_at FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.guild_id=$1",
      [guild],
    );
    return teamStats(allRows, members, events, chosen, filter, cfg);
  }
  if (name === "stats.member") {
    const id =
      filter.memberId ?? members.find((m) => m.discord_id === actor.id)?.id;
    const personal = rows.filter((r) => r.member_id === id);
    const matchIds = new Set(personal.map((r) => r.match_id));
    const events = await repo.db.query<{
      match_id: string;
      type: string;
      data: Record<string, unknown>;
    }>(
      "SELECT e.match_id,e.type,e.data,e.occurred_at FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.guild_id=$1",
      [guild],
    );
    return {
      ...aggregate(personal),
      member: members.find((m) => m.id === id)?.display_name ?? "Mitglied",
      events: observedEventStats(
        events.filter((e) => matchIds.has(e.match_id)),
        new Set(members.find((m) => m.id === id)?.identities ?? []),
      ),
    };
  }
  if (name === "stats.compare")
    return members
      .filter((m) =>
        [args.discordId, args.otherDiscordId].includes(m.discord_id),
      )
      .map((m) => ({
        member: m.display_name,
        stats: aggregate(rows.filter((r) => r.member_id === m.id)),
      }));
  if (name === "stats.server")
    return {
      matches: new Set(rows.map((r) => r.match_id)).size,
      memberResults: aggregate(rows),
      membersTracked: members.filter((m) => m.active).length,
    };
  if (name === "leaderboard") {
    if (
      ["FastestGoal", "StrongestBallHit", "GoalsPerMatch", "MMR"].includes(
        String(args.metric),
      )
    ) {
      const events = await repo.db.query<EventRow>(
        "SELECT e.match_id,e.type,e.data,e.occurred_at FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.guild_id=$1",
        [guild],
      );
      const result = [];
      for (const member of members) {
        const own = rows.filter((r) => r.member_id === member.id);
        let value: number | null = null;
        let source = "observed";
        if (args.metric === "GoalsPerMatch")
          value = aggregate(own).perMatch.Goals;
        else if (args.metric === "MMR") {
          const rating = (
            await repo.db.query<SnapshotRow>(
              "SELECT * FROM rating_snapshots WHERE member_id=$1 AND ($2::integer IS NULL OR playlist_id=$2) ORDER BY measured_at DESC LIMIT 1",
              [member.id, args.playlist ?? null],
            )
          )[0];
          if (rating) {
            value = Number(rating.mmr);
            source = rating.source;
          }
        } else
          value =
            advancedRecords(own, [member], events, cfg).find(
              (r) => r.metric === args.metric,
            )?.value ?? null;
        if (value !== null)
          result.push({
            member: member.display_name,
            memberId: member.id,
            value,
            source,
            unit:
              args.metric === "FastestGoal" ||
              args.metric === "StrongestBallHit"
                ? "Unreal Units/second"
                : args.metric === "MMR"
                  ? "manual rating"
                  : "per match",
          });
      }
      return result.sort((a, b) => b.value - a.value);
    }
    return leaderboard(
      rows,
      members,
      typeof args.metric === "string" ? args.metric : "Goals",
      cfg.minimumMatches,
    );
  }
  if (name === "records") {
    const events = await repo.db.query<EventRow>(
      "SELECT e.match_id,e.type,e.data,e.occurred_at FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.guild_id=$1",
      [guild],
    );
    return {
      automatic: advancedRecords(rows, members, events, cfg),
      allTime: await repo.db.query(
        "SELECT r.*,m.display_name FROM automatic_records r JOIN members m ON m.id=r.member_id WHERE r.guild_id=$1",
        [guild],
      ),
      personal: await repo.db.query(
        "SELECT r.*,m.display_name FROM personal_records r JOIN members m ON m.id=r.member_id WHERE m.guild_id=$1 AND ($2::uuid IS NULL OR r.member_id=$2)",
        [guild, filter.memberId ?? null],
      ),
      manual: await repo.db.query(
        "SELECT r.*,m.display_name FROM manual_records r JOIN members m ON m.id=r.member_id WHERE r.guild_id=$1 ORDER BY r.created_at DESC",
        [guild],
      ),
    };
  }
  if (name === "session.current")
    return sessions(rows, cfg.sessionTimeout).filter((s) => s.active);
  if (name === "session.latest")
    return sessions(rows, cfg.sessionTimeout).at(-1) ?? null;
  if (name === "session.list") return sessions(rows, cfg.sessionTimeout);
  if (name === "achievements")
    return repo.db.query(
      "SELECT a.* FROM achievements a JOIN members m ON m.id=a.member_id WHERE m.guild_id=$1",
      [guild],
    );
  if (name === "audit" && actor.admin)
    return repo.db.query(
      "SELECT action,actor,detail,created_at FROM audit_log WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100",
      [guild],
    );
  throw new Error("Unbekannte Aktion.");
}
