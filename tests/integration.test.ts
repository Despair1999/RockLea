import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { database, migrate, type Database } from "../packages/database/db.js";
import { Repository } from "../packages/database/repository.js";
import { server } from "../apps/backend/server.js";
import { action } from "../packages/shared/actions.js";
import { fixture, deliveries, niklas, max } from "./fixtures.js";
import { type Delivery } from "../packages/shared/model.js";
import { reconcile } from "../packages/stats-engine/reconcile.js";
let db: Database, repo: Repository;
const guild = "123456789",
  actor = { id: "1000001", admin: true };
async function collector() {
  const p = await repo.pairCode(guild, actor.id);
  return repo.pair(p.code, "test-pc");
}
beforeAll(async () => {
  db = database(process.env.TEST_DATABASE_URL ?? "pglite:");
  await migrate(db);
  repo = new Repository(db);
  await repo.setup(guild, actor.id);
  await repo.addMember(guild, actor.id, {
    discordId: actor.id,
    displayName: "Niklas",
    name: "NiklasRL",
    platform: "Epic",
  });
  await repo.addMember(guild, actor.id, {
    discordId: "1000002",
    displayName: "Max",
    name: "MaxRL",
    platform: "Epic",
  });
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("PostgreSQL transactions and acceptance scenarios", () => {
  it("redeems pairing once, rejects expired and revoked credentials", async () => {
    const p = await repo.pairCode(guild, actor.id);
    const c = await repo.pair(p.code, "One");
    await expect(repo.pair(p.code, "Two")).rejects.toThrow();
    expect(await repo.authenticate(c.token)).toBeDefined();
    await repo.collectorEdit(guild, actor.id, c.id, { revoked: true });
    expect(await repo.authenticate(c.token)).toBeUndefined();
    const p2 = await repo.pairCode(guild, actor.id);
    await db.query(
      "UPDATE pairing_codes SET expires_at=now()-interval '1 minute'",
    );
    await expect(repo.pair(p2.code, "Expired")).rejects.toThrow();
  });
  it("tracks Niklas and Max from one collector, never stores opponents", async () => {
    const c = await collector();
    const batch = deliveries();
    await repo.ingest(guild, c.id, batch);
    const people = await repo.members(guild);
    expect(people.flatMap((m) => m.identities)).toEqual(
      expect.arrayContaining([niklas, max]),
    );
    const matches = await repo.matches(guild);
    expect(matches).toHaveLength(1);
    expect(Object.keys(matches[0].state.players)).toHaveLength(2);
    expect(
      (
        (await action(repo, guild, actor, "stats.server")) as {
          matches: number;
        }
      ).matches,
    ).toBe(1);
    expect(JSON.stringify(await db.query("SELECT * FROM matches"))).not.toMatch(
      /RandomPlayer|opponent-secret|other-secret/,
    );
    expect(
      JSON.stringify(await db.query("SELECT * FROM match_events")),
    ).not.toMatch(/RandomPlayer|opponent-secret|other-secret/);
    const stats = (await action(repo, guild, actor, "stats.member")) as {
      totals: { Goals: number };
      wins: number;
    };
    expect(stats.totals.Goals).toBe(3);
    expect(stats.wins).toBe(1);
  });
  it("deduplicates two collectors, duplicated delivery and queued replay", async () => {
    const c1 = await collector(),
      c2 = await collector();
    const a = deliveries(fixture("multi")),
      b = deliveries(fixture("multi"));
    await repo.ingest(guild, c1.id, a);
    const result = await repo.ingest(guild, c1.id, a);
    expect(result.duplicates).toBe(a.length);
    await repo.ingest(guild, c2.id, b);
    expect(
      await db.query("SELECT * FROM matches WHERE guid='multi'"),
    ).toHaveLength(1);
    const match = (await repo.matches(guild)).find((m) => m.guid === "multi")!;
    expect(
      await db.query("SELECT * FROM match_events WHERE match_id=$1", [
        match.id,
      ]),
    ).toHaveLength(3);
    expect(
      await db.query("SELECT * FROM match_sources WHERE match_id=$1", [
        match.id,
      ]),
    ).toHaveLength(2);
    expect(
      await db.query("SELECT * FROM notifications WHERE key=$1", [
        `match:${match.id}`,
      ]),
    ).toHaveLength(1);
  });
  it("reconstructs a running match after backend repository restart", async () => {
    const c = await collector(),
      events = deliveries(fixture("restart"));
    await repo.ingest(guild, c.id, events.slice(0, 6));
    const restarted = new Repository(db);
    await restarted.ingest(guild, c.id, events.slice(6));
    expect(
      (await repo.matches(guild)).find((m) => m.guid === "restart")?.state
        .quality,
    ).toBe("complete");
  });
  it("keeps identity after rename, records name history", async () => {
    const c = await collector();
    const events = fixture("rename");
    for (const e of events)
      if (e.Event === "UpdateState") {
        const players = e.Data.Players as { PrimaryId: string; Name: string }[];
        players.find((p) => p.PrimaryId === max)!.Name = "MaxRL2";
      }
    await repo.ingest(guild, c.id, deliveries(events));
    expect(
      await db.query("SELECT * FROM name_history WHERE primary_id=$1", [max]),
    ).toHaveLength(2);
    expect(
      (await repo.members(guild)).find((m) => m.discord_id === "1000002")
        ?.identities,
    ).toEqual([max]);
  });
  it("unknown event is harmless, recovery is explicit", async () => {
    const c = await collector();
    const events = fixture("recover").filter((e) => e.Event !== "MatchEnded");
    events.splice(4, 0, {
      Event: "FutureEvent",
      Data: { MatchGuid: "recover", SecretOpponent: "must disappear" },
    });
    await repo.ingest(guild, c.id, deliveries(events));
    expect(
      (await repo.matches(guild)).find((m) => m.guid === "recover")?.state
        .quality,
    ).toBe("recovered");
  });
  it("rejects administrative commands from members", async () => {
    await expect(
      action(repo, guild, { ...actor, admin: false }, "collector.pair"),
    ).rejects.toThrow();
    await expect(
      action(repo, guild, { ...actor, admin: false }, "member.remove", {
        discordId: "1000002",
      }),
    ).rejects.toThrow();
  });
  it("materializes records and achievements exactly once", async () => {
    await db.query("UPDATE matches SET updated_at=now()-interval '20 seconds'");
    await reconcile(db);
    const count = (await db.query("SELECT * FROM notifications")).length;
    const records = await db.query<{
      metric: string;
      value: number | string;
      unit: string;
    }>("SELECT * FROM automatic_records");
    expect(records.map((r) => r.metric)).toEqual(
      expect.arrayContaining([
        "Goals",
        "FastestGoal",
        "StrongestBallHit",
        "DailyWinrate",
        "SessionMatches",
      ]),
    );
    expect(records.find((r) => r.metric === "FastestGoal")?.unit).toBe(
      "Unreal Units/second",
    );
    expect(
      (await db.query("SELECT * FROM achievements")).length,
    ).toBeGreaterThan(0);
    await reconcile(db);
    expect((await db.query("SELECT * FROM notifications")).length).toBe(count);
  });
  it("claims notification without a nested-database deadlock and acknowledges it", async () => {
    await db.query(
      "UPDATE notifications SET available_at=now()-interval '1 minute'",
    );
    const app = await server(repo, {
      internalToken: "x".repeat(40),
      publicUrl: "http://localhost:3000",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/internal/queue/claim",
      headers: { authorization: `Bearer ${"x".repeat(40)}` },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const job = response.json();
    expect(job.id).toBeDefined();
    const ack = await app.inject({
      method: "POST",
      url: "/api/v1/internal/queue/ack",
      headers: { authorization: `Bearer ${"x".repeat(40)}` },
      payload: { id: job.id, ok: true },
    });
    expect(ack.statusCode).toBe(200);
    await app.close();
  });
  it("rejects a malformed event but continues the match batch", async () => {
    const c = await collector();
    const b = deliveries(fixture("invalid"));
    b[3].event.Data.Players = "wrong";
    const result = await repo.ingest(guild, c.id, b);
    expect(result.rejected).toEqual([b[3].id]);
    expect(
      (await repo.matches(guild)).find((m) => m.guid === "invalid")?.state
        .sawEnd,
    ).toBe(true);
  });
  it("rejects cross-origin and cross-guild dashboard mutations", async () => {
    const { hash, secret } = await import("../packages/shared/crypto.js");
    const token = secret();
    await db.query(
      "INSERT INTO web_sessions(hash,user_id,guilds,expires_at) VALUES($1,$2,$3,now()+interval '1 minute')",
      [hash(token), actor.id, JSON.stringify([{ id: guild, name: "Test" }])],
    );
    const app = await server(repo, {
      internalToken: "x".repeat(40),
      publicUrl: "http://localhost:3000",
    });
    const send = (target: string, origin: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/guild/${target}/action`,
        headers: {
          cookie: `rl_session=${token}`,
          origin,
          "x-rocklea-request": "1",
        },
        payload: { action: "config.get" },
      });
    expect((await send(guild, "http://localhost:3000")).statusCode).toBe(200);
    expect((await send(guild, "https://foreign.example")).statusCode).toBe(401);
    expect((await send("987654321", "http://localhost:3000")).statusCode).toBe(
      401,
    );
    await db.query(
      "UPDATE web_sessions SET expires_at=now()-interval '1 minute' WHERE hash=$1",
      [hash(token)],
    );
    expect((await send(guild, "http://localhost:3000")).statusCode).toBe(401);
    await app.close();
  });
  it("enforces guild isolation and authenticated API access", async () => {
    const app = await server(repo, {
      internalToken: "x".repeat(40),
      publicUrl: "http://localhost:3000",
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/internal/action",
          payload: { guild, actor, action: "member.list" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/collector/roster" }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/me" })).statusCode,
    ).toBe(401);
    const c = await collector();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/collector/events",
      headers: { authorization: `Bearer ${c.token}` },
      payload: deliveries(fixture("api")),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(await repo.matches("other-guild")).toHaveLength(0);
    await app.close();
  });
  it("reports common-team matches once and retains per-member statistics", async () => {
    const people = await repo.members(guild);
    const result = (await action(repo, guild, actor, "stats.team", {
      teamMembers: people.map((m) => m.id),
      period: "all",
    })) as {
      matches: number;
      wins: number;
      members: unknown[];
      observedMutualAssists: number;
    };
    expect(result.matches).toBeGreaterThan(0);
    expect(result.wins).toBeLessThanOrEqual(result.matches);
    expect(result.members).toHaveLength(2);
    expect(result.observedMutualAssists).toBeGreaterThan(0);
  });
  it("keeps nested comparison stats in Discord pages", async () => {
    const { resultEmbeds } = await import("../packages/discord-ui/embeds.js");
    const result = await action(repo, guild, actor, "stats.compare", {
      discordId: actor.id,
      otherDiscordId: "1000002",
      period: "all",
    });
    const text = resultEmbeds("Vergleich", result)
      .map((e) => e.toJSON().description)
      .join("\n");
    expect(text).toContain("Niklas");
    expect(text).toContain("Max");
    expect(text).toContain("Tore");
  });
  it("erases historical unlinked identities and cascades stats after privacy deletion", async () => {
    await repo.unlink(guild, actor.id, max);
    await repo.deleteMember(guild, actor.id, "1000002");
    expect(
      (await repo.members(guild)).some((m) => m.discord_id === "1000002"),
    ).toBe(false);
    expect(
      JSON.stringify(await db.query("SELECT state FROM matches")),
    ).not.toContain(max);
    expect(
      JSON.stringify(await db.query("SELECT data FROM match_events")),
    ).not.toContain(max);
    expect((await repo.matches(guild)).length).toBeGreaterThan(0);
  });
  it("cannot restore deleted member from old offline delivery", async () => {
    const c = await collector();
    const old: Delivery[] = deliveries(fixture("privacy-replay")).map((x) => ({
      ...x,
      id: randomUUID(),
    }));
    await repo.ingest(guild, c.id, old);
    const match = (await repo.matches(guild)).find(
      (m) => m.guid === "privacy-replay",
    )!;
    expect(Object.keys(match.state.players)).toEqual([niklas]);
  });
});
