import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Database, type Query } from "./db.js";
import {
  defaults,
  configSchema,
  primaryId,
  type GuildConfig,
  type Member,
  type MatchState,
  type Delivery,
  type Player,
} from "../shared/model.js";
import { hash, secret, canonical } from "../shared/crypto.js";
import {
  sanitize,
  statePlayers,
  matchGuid,
} from "../rocket-league-api/parser.js";
import { advance } from "../stats-engine/state.js";
import { relationships } from "../stats-engine/analytics.js";
export type MatchRow = {
  id: string;
  guid: string;
  state: MatchState;
  started_at: Date;
  ended_at: Date | null;
};
export async function roster(q: Query, guild: string): Promise<Member[]> {
  return q.query<Member>(
    `SELECT m.*, coalesce(array_agg(i.primary_id) FILTER (WHERE i.primary_id IS NOT NULL), '{}') identities FROM members m LEFT JOIN identities i ON i.member_id=m.id WHERE m.guild_id=$1 GROUP BY m.id ORDER BY m.created_at`,
    [guild],
  );
}
export async function audit(
  q: Query,
  guild: string,
  actor: string,
  action: string,
  detail: unknown,
) {
  await q.query(
    "INSERT INTO audit_log(id,guild_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), guild, actor, action, JSON.stringify(detail)],
  );
}
export class Repository {
  private pendingCandidates = new Map<
    string,
    { expires: number; players: Player[] }
  >();
  constructor(public db: Database) {}
  detected(guild: string) {
    const value = this.pendingCandidates.get(guild);
    return value && value.expires > Date.now() ? value.players : [];
  }
  async setup(guild: string, actor: string, config: unknown = {}) {
    const parsed = configSchema.parse(config);
    await this.db.transaction(async (q) => {
      await q.query(
        "INSERT INTO guilds(id,config) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
        [guild, JSON.stringify(parsed)],
      );
      await audit(q, guild, actor, "setup", {});
    });
    return this.config(guild);
  }
  async config(guild: string): Promise<GuildConfig> {
    const row = (
      await this.db.query<{ config: GuildConfig }>(
        "SELECT config FROM guilds WHERE id=$1",
        [guild],
      )
    )[0];
    if (!row) throw new Error("Server zuerst mit /setup einrichten.");
    return configSchema.parse(row.config);
  }
  async setConfig(guild: string, actor: string, input: unknown) {
    const parsed = configSchema.parse(input);
    await this.db.transaction(async (q) => {
      const old = await q.query(
        "SELECT config FROM guilds WHERE id=$1 FOR UPDATE",
        [guild],
      );
      await q.query("UPDATE guilds SET config=$2 WHERE id=$1", [
        guild,
        JSON.stringify(parsed),
      ]);
      await audit(q, guild, actor, "config", { before: old[0], after: parsed });
    });
    return parsed;
  }
  members(guild: string) {
    return roster(this.db, guild);
  }
  async addMember(guild: string, actor: string, input: unknown) {
    const v = z
      .object({
        discordId: z.string().regex(/^\d{5,25}$/),
        displayName: z.string().min(1).max(128),
        name: z.string().min(1).max(128),
        platform: z.enum([
          "Epic",
          "Steam",
          "PS4",
          "XboxOne",
          "Switch",
          "PsyNet",
        ]),
      })
      .parse(input);
    return this.db.transaction(async (q) => {
      const rows = await q.query<Member>(
        "INSERT INTO members(id,guild_id,discord_id,display_name,pending_name,pending_platform) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,discord_id) DO UPDATE SET display_name=excluded.display_name,pending_name=excluded.pending_name,pending_platform=excluded.pending_platform RETURNING *",
        [randomUUID(), guild, v.discordId, v.displayName, v.name, v.platform],
      );
      await audit(q, guild, actor, "member.add", { memberId: rows[0].id });
      return rows[0];
    });
  }
  async editMember(guild: string, actor: string, id: string, input: unknown) {
    const v = z
      .object({
        active: z.boolean().optional(),
        displayName: z.string().min(1).max(128).optional(),
      })
      .parse(input);
    await this.db.transaction(async (q) => {
      await q.query(
        "UPDATE members SET active=coalesce($3,active),display_name=coalesce($4,display_name) WHERE guild_id=$1 AND id=$2",
        [guild, id, v.active ?? null, v.displayName ?? null],
      );
      await audit(q, guild, actor, "member.edit", { id, ...v });
    });
  }
  async link(guild: string, actor: string, id: string, pid: string) {
    primaryId.parse(pid);
    await this.db.transaction(async (q) => {
      const member = (
        await q.query<Member>(
          "SELECT * FROM members WHERE guild_id=$1 AND id=$2",
          [guild, id],
        )
      )[0];
      if (!member) throw new Error("Mitglied nicht gefunden.");
      await q.query(
        "INSERT INTO identities(guild_id,primary_id,member_id,current_name,verified) VALUES($1,$2,$3,$4,true) ON CONFLICT(guild_id,primary_id) DO UPDATE SET verified=true WHERE identities.member_id=excluded.member_id",
        [guild, pid, id, member.pending_name ?? member.display_name],
      );
      const owner = (
        await q.query<{ member_id: string }>(
          "SELECT member_id FROM identities WHERE guild_id=$1 AND primary_id=$2",
          [guild, pid],
        )
      )[0];
      if (owner.member_id !== id)
        throw new Error(
          "Identität ist bereits einem anderen Mitglied zugeordnet.",
        );
      await q.query(
        "UPDATE members SET pending_name=NULL,pending_platform=NULL WHERE id=$1",
        [id],
      );
      await audit(q, guild, actor, "identity.link", {
        memberId: id,
        primaryId: pid,
      });
    });
  }
  async unlink(guild: string, actor: string, pid: string) {
    await this.db.transaction(async (q) => {
      await q.query(
        "DELETE FROM identities WHERE guild_id=$1 AND primary_id=$2",
        [guild, pid],
      );
      await audit(q, guild, actor, "identity.unlink", {});
    });
  }
  async pairCode(guild: string, actor: string, ownerDiscordId = actor) {
    const code = `RL-${secret().slice(0, 16).toUpperCase()}`;
    await this.db.transaction(async (q) => {
      const owner = (
        await q.query<{ id: string }>(
          "SELECT id FROM members WHERE guild_id=$1 AND discord_id=$2",
          [guild, ownerDiscordId],
        )
      )[0];
      await q.query(
        "INSERT INTO pairing_codes(hash,guild_id,expires_at,owner_member_id) VALUES($1,$2,now()+interval '10 minutes',$3)",
        [hash(code), guild, owner?.id ?? null],
      );
      await audit(q, guild, actor, "collector.pair", {});
    });
    return { code, expiresInSeconds: 600 };
  }
  async pair(code: string, name: string) {
    return this.db.transaction(async (q) => {
      const row = (
        await q.query<{ guild_id: string; owner_member_id: string | null }>(
          "DELETE FROM pairing_codes WHERE hash=$1 AND expires_at>now() RETURNING guild_id,owner_member_id",
          [hash(code)],
        )
      )[0];
      if (!row) throw new Error("Pairing-Code ungültig oder abgelaufen.");
      const token = secret(),
        id = randomUUID();
      await q.query(
        "INSERT INTO collectors(id,guild_id,name,token_hash,owner_member_id) VALUES($1,$2,$3,$4,$5)",
        [id, row.guild_id, name, hash(token), row.owner_member_id],
      );
      return { id, token, guildId: row.guild_id };
    });
  }
  async authenticate(token: string) {
    return (
      await this.db.query<{ id: string; guild_id: string }>(
        "SELECT id,guild_id FROM collectors WHERE token_hash=$1 AND revoked=false",
        [hash(token)],
      )
    )[0];
  }
  collectors(guild: string) {
    return this.db.query(
      "SELECT c.id,c.name,c.owner_member_id,m.display_name AS owner_name,c.revoked,c.last_seen_at,c.status FROM collectors c LEFT JOIN members m ON m.id=c.owner_member_id WHERE c.guild_id=$1 ORDER BY c.name",
      [guild],
    );
  }
  async collectorEdit(
    guild: string,
    actor: string,
    id: string,
    values: { name?: string; revoked?: boolean },
  ) {
    await this.db.transaction(async (q) => {
      await q.query(
        "UPDATE collectors SET name=coalesce($3,name),revoked=coalesce($4,revoked) WHERE guild_id=$1 AND id=$2",
        [guild, id, values.name ?? null, values.revoked ?? null],
      );
      await audit(q, guild, actor, "collector.edit", { id, ...values });
    });
  }
  async ingest(guild: string, collector: string, batch: Delivery[]) {
    return this.db.transaction(async (q) => {
      // Serializes all observations for a guild across backend replicas.
      const cfg = configSchema.parse(
        (
          await q.query<{ config: GuildConfig }>(
            "SELECT config FROM guilds WHERE id=$1 FOR UPDATE",
            [guild],
          )
        )[0].config,
      );
      const auth = (
        await q.query<{ id: string; owner_member_id: string | null }>(
          "SELECT id,owner_member_id FROM collectors WHERE id=$1 AND guild_id=$2 AND revoked=false",
          [collector, guild],
        )
      )[0];
      if (!auth) throw new Error("Collector widerrufen.");
      let members = await roster(q, guild);
      let duplicates = 0,
        processed = 0;
      const rejected: string[] = [];
      for (const item of batch) {
        await q.exec("SAVEPOINT event_item");
        try {
          const receipt = await q.query(
            "INSERT INTO receipts(collector_id,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id",
            [collector, item.id],
          );
          if (!receipt.length) {
            duplicates++;
            continue;
          }
          const guid = matchGuid(item.event);
          if (!guid) continue;
          const previous = (
            await q.query<MatchRow>(
              "SELECT * FROM matches WHERE guild_id=$1 AND guid=$2",
              [guild, guid],
            )
          )[0];
          const observed =
            item.event.Event === "UpdateState"
              ? statePlayers(item.event)
              : Object.values(previous?.state.players ?? {});
          const clean = sanitize(item.event, members, observed);
          if (
            item.event.Event === "ReplayCreated" ||
            (clean.Data.Game as { bReplay?: boolean } | undefined)?.bReplay
          )
            continue;
          if (clean.Event === "UpdateState") {
            const players = statePlayers(clean);
            for (const p of players) {
              if (members.some((m) => m.identities.includes(p.PrimaryId)))
                continue;
              const candidates = members.filter(
                (m) =>
                  m.active &&
                  m.pending_name === p.Name &&
                  m.pending_platform === p.PrimaryId.split("|")[0],
              );
              const sameName = players.filter(
                (x) =>
                  x.Name === p.Name &&
                  x.PrimaryId.split("|")[0] === p.PrimaryId.split("|")[0],
              );
              if (candidates.length === 1 && sameName.length === 1) {
                await q.query(
                  "INSERT INTO identities(guild_id,primary_id,member_id,current_name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
                  [guild, p.PrimaryId, candidates[0].id, p.Name],
                );
                await q.query(
                  "UPDATE members SET pending_name=NULL,pending_platform=NULL WHERE id=$1",
                  [candidates[0].id],
                );
                await audit(q, guild, "system", "identity.detected", {
                  memberId: candidates[0].id,
                  primaryId: p.PrimaryId,
                });
              } else if (candidates.length) {
                this.pendingCandidates.set(guild, {
                  expires: Date.now() + 600000,
                  players: players.filter((p) =>
                    members.some(
                      (m) =>
                        m.pending_name === p.Name &&
                        m.pending_platform === p.PrimaryId.split("|")[0],
                    ),
                  ),
                });
              }
            }
            members = await roster(q, guild);
            clean.Data.Players = players.filter((p) =>
              members.some(
                (m) => m.active && m.identities.includes(p.PrimaryId),
              ),
            );
            if (!cfg.trackRegisteredMembersAsOpponents) {
              const owner = members.find((m) => m.id === auth.owner_member_id);
              const ownerTeams = new Set(
                players
                  .filter((p) => owner?.identities.includes(p.PrimaryId))
                  .map((p) => p.TeamNum),
              );
              clean.Data.Players =
                ownerTeams.size === 1
                  ? (clean.Data.Players as Player[]).filter((p) =>
                      ownerTeams.has(p.TeamNum),
                    )
                  : [];
            }
          }
          const s = advance(previous?.state, clean, item.occurredAt);
          const activeIds = new Set(
            members.filter((m) => m.active).flatMap((m) => m.identities),
          );
          for (const id of Object.keys(s.players))
            if (!activeIds.has(id)) delete s.players[id];
          if (
            cfg.playlistIds.length &&
            s.game.PlaylistId !== undefined &&
            !cfg.playlistIds.includes(s.game.PlaylistId)
          )
            continue;
          const id = previous?.id ?? randomUUID();
          await q.query(
            "INSERT INTO matches(id,guild_id,guid,state,started_at,ended_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,guid) DO UPDATE SET state=excluded.state,started_at=excluded.started_at,ended_at=excluded.ended_at,updated_at=now()",
            [
              id,
              guild,
              guid,
              JSON.stringify(s),
              s.startedAt,
              s.endedAt ?? null,
            ],
          );
          await q.query(
            "INSERT INTO match_sources(match_id,collector_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [id, collector],
          );
          for (const p of Object.values(s.players)) {
            const member = members.find(
              (m) => m.active && m.identities.includes(p.PrimaryId),
            );
            if (!member) continue;
            await q.query(
              "INSERT INTO match_members(match_id,member_id,primary_id,name,team,stats) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(match_id,member_id,primary_id) DO UPDATE SET name=excluded.name,team=excluded.team,stats=excluded.stats",
              [
                id,
                member.id,
                p.PrimaryId,
                p.Name,
                p.TeamNum,
                JSON.stringify(p),
              ],
            );
            await q.query(
              "UPDATE identities SET current_name=$3,last_seen_at=$4 WHERE guild_id=$1 AND primary_id=$2",
              [guild, p.PrimaryId, p.Name, item.occurredAt],
            );
            await q.query(
              "INSERT INTO name_history(guild_id,primary_id,name,first_seen_at,last_seen_at) VALUES($1,$2,$3,$4,$4) ON CONFLICT(guild_id,primary_id,name) DO UPDATE SET last_seen_at=greatest(name_history.last_seen_at,excluded.last_seen_at)",
              [guild, p.PrimaryId, p.Name, item.occurredAt],
            );
          }
          if (
            ["GoalScored", "BallHit", "StatfeedEvent", "CrossbarHit"].includes(
              clean.Event,
            ) &&
            Object.keys(s.players).length
          ) {
            const fingerprint = hash(canonical(clean));
            const inserted = await q.query(
              "INSERT INTO match_events(id,match_id,fingerprint,ordinal,type,data,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id",
              [
                randomUUID(),
                id,
                fingerprint,
                item.ordinal,
                clean.Event,
                JSON.stringify(clean.Data),
                item.occurredAt,
              ],
            );
            if (
              inserted.length &&
              cfg.goalPosts &&
              clean.Event === "GoalScored" &&
              clean.Data.Scorer
            )
              await q.query(
                "INSERT INTO notifications(id,guild_id,key,kind,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                [
                  randomUUID(),
                  guild,
                  `goal:${id}:${fingerprint}:${item.ordinal}`,
                  "goal",
                  JSON.stringify({
                    scorer: (clean.Data.Scorer as Player).Name,
                    assister:
                      (clean.Data.Assister as Player | undefined)?.Name ?? null,
                    rawSpeed: clean.Data.GoalSpeed,
                    rawUnit: "Unreal Units/second",
                  }),
                ],
              );
          }
          if (s.endedAt && Object.keys(s.players).length)
            await q.query(
              "INSERT INTO notifications(id,guild_id,key,kind,payload,available_at) VALUES($1,$2,$3,'match',$4,now()+interval '10 seconds') ON CONFLICT(guild_id,key) DO UPDATE SET payload=notifications.payload || excluded.payload,sent_at=CASE WHEN $5 OR (excluded.payload ? 'scoreboard' AND notifications.payload->'scoreboard' IS DISTINCT FROM excluded.payload->'scoreboard') THEN NULL ELSE notifications.sent_at END",
              [
                randomUUID(),
                guild,
                `match:${id}`,
                JSON.stringify({
                  matchId: id,
                  ...(s.sawEnd && clean.Data.FinalScoreboard
                    ? { scoreboard: clean.Data.FinalScoreboard }
                    : {}),
                }),
                Boolean(
                  previous?.state.endedAt &&
                  canonical({
                    players: previous.state.players,
                    teams: previous.state.game.Teams,
                    winner: previous.state.winner,
                  }) !==
                    canonical({
                      players: s.players,
                      teams: s.game.Teams,
                      winner: s.winner,
                    }),
                ),
              ],
            );
          processed++;
        } catch (error) {
          if (!(error instanceof z.ZodError)) throw error;
          await q.exec("ROLLBACK TO SAVEPOINT event_item");
          rejected.push(item.id);
        } finally {
          await q.exec("RELEASE SAVEPOINT event_item");
        }
      }
      await q.query("UPDATE collectors SET last_seen_at=now() WHERE id=$1", [
        collector,
      ]);
      return {
        accepted: batch.map((x) => x.id),
        duplicates,
        processed,
        rejected,
      };
    });
  }
  async matches(guild: string, limit = 100) {
    return this.db.query<MatchRow>(
      "SELECT * FROM matches WHERE guild_id=$1 AND EXISTS(SELECT 1 FROM match_members mm WHERE mm.match_id=matches.id) ORDER BY started_at DESC LIMIT $2",
      [guild, limit],
    );
  }
  async match(guild: string, id: string) {
    const row = (
      await this.db.query<MatchRow>(
        "SELECT * FROM matches WHERE guild_id=$1 AND id=$2",
        [guild, id],
      )
    )[0];
    if (!row) throw new Error("Match nicht gefunden.");
    return {
      ...row,
      relationships: relationships(row.state.players),
      events: await this.db.query(
        "SELECT type,data,occurred_at FROM match_events WHERE match_id=$1 ORDER BY occurred_at",
        [id],
      ),
      sources: await this.db.query(
        "SELECT collector_id FROM match_sources WHERE match_id=$1",
        [id],
      ),
    };
  }
  async observations(guild: string) {
    return this.db.query<{
      member_id: string;
      stats: Player;
      state: MatchState;
      match_id: string;
    }>(
      `SELECT mm.member_id,mm.stats,m.state,m.id match_id FROM match_members mm JOIN matches m ON m.id=mm.match_id WHERE m.guild_id=$1 AND m.ended_at IS NOT NULL ORDER BY m.started_at`,
      [guild],
    );
  }
  async exportMember(guild: string, discord: string) {
    const member = (await this.members(guild)).find(
      (m) => m.discord_id === discord,
    );
    if (!member) return { member: null };
    const historical = await this.db.query<{ primary_id: string }>(
      "SELECT DISTINCT primary_id FROM match_members WHERE member_id=$1",
      [member.id],
    );
    const ownIds = new Set([
      ...member.identities,
      ...historical.map((r) => r.primary_id),
    ]);
    const events = await this.db.query<{
      type: string;
      data: Record<string, unknown>;
      occurred_at: Date;
      state: MatchState;
    }>(
      "SELECT e.type,e.data,e.occurred_at,m.state FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.guild_id=$1",
      [guild],
    );
    return {
      member,
      identities: await this.db.query(
        "SELECT * FROM identities WHERE member_id=$1",
        [member.id],
      ),
      nameHistory: await this.db.query(
        "SELECT n.* FROM name_history n JOIN identities i USING(guild_id,primary_id) WHERE i.member_id=$1",
        [member.id],
      ),
      matches: await this.db.query(
        "SELECT * FROM match_members WHERE member_id=$1",
        [member.id],
      ),
      ratings: await this.db.query(
        "SELECT * FROM rating_snapshots WHERE member_id=$1",
        [member.id],
      ),
      records: await this.db.query(
        "SELECT * FROM manual_records WHERE member_id=$1",
        [member.id],
      ),
      automaticRecords: await this.db.query(
        "SELECT * FROM personal_records WHERE member_id=$1",
        [member.id],
      ),
      achievements: await this.db.query(
        "SELECT * FROM achievements WHERE member_id=$1",
        [member.id],
      ),
      events: events
        .filter((e) =>
          [...ownIds].some((id) =>
            JSON.stringify(e.data).includes(JSON.stringify(id)),
          ),
        )
        .map((e) => ({
          occurredAt: e.occurred_at,
          event: sanitize(
            { Event: e.type, Data: e.data },
            [{ ...member, active: true, identities: [...ownIds] }],
            Object.values(e.state.players),
          ),
        })),
    };
  }
  async deleteMember(guild: string, actor: string, discord: string) {
    await this.db.transaction(async (q) => {
      await q.query("SELECT id FROM guilds WHERE id=$1 FOR UPDATE", [guild]);
      const member = (await roster(q, guild)).find(
        (m) => m.discord_id === discord,
      );
      if (!member) return;
      const historical = await q.query<{ primary_id: string }>(
        "SELECT DISTINCT primary_id FROM match_members WHERE member_id=$1",
        [member.id],
      );
      const ids = new Set([
        ...member.identities,
        ...historical.map((r) => r.primary_id),
      ]);
      for (const row of await q.query<MatchRow>(
        "SELECT * FROM matches WHERE guild_id=$1",
        [guild],
      )) {
        for (const [pid, p] of Object.entries(row.state.players))
          if (ids.has(pid)) {
            delete row.state.players[pid];
            ids.add(p.PrimaryId);
          }
        await q.query("UPDATE matches SET state=$2 WHERE id=$1", [
          row.id,
          JSON.stringify(row.state),
        ]);
        // Event rows involving this member are removed, not retained with hidden personal fields.
        for (const e of await q.query<{ id: string; data: unknown }>(
          "SELECT id,data FROM match_events WHERE match_id=$1",
          [row.id],
        ))
          if (
            [...ids].some((pid) =>
              JSON.stringify(e.data).includes(JSON.stringify(pid)),
            )
          )
            await q.query("DELETE FROM match_events WHERE id=$1", [e.id]);
      }
      await q.query("DELETE FROM members WHERE id=$1", [member.id]);
      // No stable identities in the board: remove the whole transient board for
      // this guild rather than trying to match personal names heuristically.
      await q.query(
        "UPDATE notifications SET payload=payload-'scoreboard' WHERE guild_id=$1 AND kind='match'",
        [guild],
      );
      await q.query(
        "DELETE FROM notifications WHERE guild_id=$1 AND kind<>'match'",
        [guild],
      );
      this.pendingCandidates.delete(guild);
      await q.query(
        "DELETE FROM audit_log WHERE guild_id=$1 AND (actor=$2 OR detail::text LIKE $3)",
        [guild, discord, `%${member.id}%`],
      );
      await audit(
        q,
        guild,
        actor === discord ? "self-service" : actor,
        "privacy.delete",
        { anonymized: true },
      );
    });
  }
}
export { defaults };
