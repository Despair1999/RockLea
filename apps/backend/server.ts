import Fastify, { LogController } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Repository } from "../../packages/database/repository.js";
import { delivery } from "../../packages/shared/model.js";
import { action } from "../../packages/shared/actions.js";
import { hash, secret } from "../../packages/shared/crypto.js";
export type Settings = {
  internalToken: string;
  publicUrl: string;
  clientId?: string;
  clientSecret?: string;
  production?: boolean;
  logger?: boolean;
};
const bearer = (header?: string) =>
  header?.startsWith("Bearer ") ? header.slice(7) : "";
const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return (
    left.length > 0 &&
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
};
class PrivateLogController extends LogController {
  constructor() {
    super({ disableRequestLogging: true });
  }
}
export async function server(repo: Repository, settings: Settings) {
  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024,
    logger: settings.logger
      ? {
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            "body",
            "res.headers.set-cookie",
          ],
          level: "info",
        }
      : false,
    logController: new PrivateLogController(),
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: {
      info: { title: "RockLea Internal API", version: "1.0.0" },
      components: {
        securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      },
    },
  });
  app.setErrorHandler((err, req, reply) => {
    const status =
      err instanceof z.ZodError
        ? 400
        : typeof err === "object" && err && "statusCode" in err
          ? Number(err.statusCode)
          : 400;
    req.log.warn({ requestId: req.id, status }, "Anfrage abgelehnt");
    reply.code(status >= 400 && status < 600 ? status : 500).send({
      error:
        err instanceof z.ZodError
          ? "Ungültige Eingaben."
          : status === 401
            ? "Nicht autorisiert."
            : "Anfrage konnte nicht verarbeitet werden. Eingaben und Berechtigungen prüfen.",
    });
  });
  const unauthorized = () =>
    Object.assign(new Error("Nicht autorisiert."), { statusCode: 401 });
  async function collectorAuth(header?: string) {
    const c = await repo.authenticate(bearer(header));
    if (!c) throw unauthorized();
    return c;
  }
  const totals = { received: 0, processed: 0, duplicates: 0, errors: 0 };
  app.get("/health", async (_req, reply) => {
    try {
      await repo.db.query("SELECT 1");
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  app.get("/api/v1/openapi", async (req) => {
    if (!equal(bearer(req.headers.authorization), settings.internalToken))
      throw unauthorized();
    return app.swagger();
  });
  app.post(
    "/api/v1/collector/pair",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        description: "Redeem a one-use code for collector credentials",
      },
    },
    async (req) => {
      const v = z
        .object({ code: z.string().max(64), name: z.string().min(1).max(80) })
        .parse(req.body);
      return repo.pair(v.code, v.name);
    },
  );
  app.get("/api/v1/collector/roster", async (req) => {
    const c = await collectorAuth(req.headers.authorization);
    return repo.members(c.guild_id);
  });
  app.post("/api/v1/collector/heartbeat", async (req) => {
    const c = await collectorAuth(req.headers.authorization);
    const v = z
      .object({
        gameConnected: z.boolean(),
        queueDepth: z.number().int().nonnegative(),
        version: z.string().max(32),
      })
      .parse(req.body);
    await repo.db.query(
      "UPDATE collectors SET last_seen_at=now(),status=$2 WHERE id=$1",
      [c.id, JSON.stringify(v)],
    );
    return { ok: true };
  });
  app.post(
    "/api/v1/collector/events",
    {
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
      schema: {
        description:
          "Ordered batches, at most 100 sanitized Rocket League envelopes. Idempotent delivery IDs.",
        security: [{ bearer: [] }],
      },
    },
    async (req) => {
      const c = await collectorAuth(req.headers.authorization);
      const v = z.array(delivery).min(1).max(100).parse(req.body);
      totals.received += v.length;
      for (const item of v) {
        if (Date.parse(item.occurredAt) > Date.now() + 300000)
          throw new Error("Collector-Uhr liegt in der Zukunft.");
      }
      try {
        const r = await repo.ingest(c.guild_id, c.id, v);
        totals.processed += r.processed;
        totals.duplicates += r.duplicates;
        return r;
      } catch (e) {
        totals.errors++;
        throw e;
      }
    },
  );
  app.get("/api/v1/metrics", async (req) => {
    if (!equal(bearer(req.headers.authorization), settings.internalToken))
      throw unauthorized();
    return {
      ...totals,
      queueDepth: (
        await repo.db.query<{ count: string }>(
          "SELECT count(*) FROM notifications WHERE sent_at IS NULL",
        )
      )[0].count,
    };
  });
  // Internal API is only used by the trusted bot; the dashboard never receives this key.
  app.post("/api/v1/internal/action", async (req) => {
    if (!equal(bearer(req.headers.authorization), settings.internalToken))
      throw unauthorized();
    const v = z
      .object({
        guild: z.string(),
        actor: z.object({ id: z.string(), admin: z.boolean() }),
        action: z.string(),
        args: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(req.body);
    return (
      (await action(repo, v.guild, v.actor, v.action, v.args)) ?? { ok: true }
    );
  });
  app.post("/api/v1/internal/queue/claim", async (req) => {
    if (!equal(bearer(req.headers.authorization), settings.internalToken))
      throw unauthorized();
    const row = await repo.db.transaction(async (q) => {
      const row = (
        await q.query<{
          id: string;
          guild_id: string;
          kind: string;
          payload: { matchId?: string };
        }>(
          "SELECT * FROM notifications WHERE sent_at IS NULL AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      )[0];
      if (!row) return null;
      await q.query(
        "UPDATE notifications SET lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$1",
        [row.id],
      );
      return row;
    });
    if (!row) return null;
    return {
      ...row,
      config: await repo.config(row.guild_id),
      match: row.payload.matchId
        ? await repo.match(row.guild_id, row.payload.matchId)
        : undefined,
    };
  });
  app.post("/api/v1/internal/queue/ack", async (req) => {
    if (!equal(bearer(req.headers.authorization), settings.internalToken))
      throw unauthorized();
    const v = z
      .object({ id: z.string().uuid(), ok: z.boolean() })
      .parse(req.body);
    await repo.db.query(
      v.ok
        ? "UPDATE notifications SET sent_at=now(),lease_until=NULL WHERE id=$1"
        : "UPDATE notifications SET lease_until=NULL,available_at=now()+interval '1 minute' * least(attempts,60) WHERE id=$1",
      [v.id],
    );
    return { ok: true };
  });
  app.post("/api/v1/internal/message", async (req) => {
    if (!equal(bearer(req.headers.authorization), settings.internalToken))
      throw unauthorized();
    const v = z
      .object({
        guild: z.string(),
        key: z.string(),
        channel: z.string(),
        message: z.string().optional(),
      })
      .parse(req.body);
    if (v.message)
      await repo.db.query(
        "INSERT INTO discord_messages(guild_id,key,channel_id,message_id) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,key) DO UPDATE SET channel_id=excluded.channel_id,message_id=excluded.message_id",
        [v.guild, v.key, v.channel, v.message],
      );
    return (
      (
        await repo.db.query(
          "SELECT message_id FROM discord_messages WHERE guild_id=$1 AND key=$2 AND channel_id=$3",
          [v.guild, v.key, v.channel],
        )
      )[0] ?? null
    );
  });
  app.get("/auth/login", async (_req, reply) => {
    if (!settings.clientId || !settings.clientSecret)
      throw new Error("Discord OAuth ist noch nicht konfiguriert.");
    const state = secret();
    reply.setCookie("rl_oauth", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: settings.production,
      path: "/",
      maxAge: 600,
    });
    const params = new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: `${settings.publicUrl}/auth/callback`,
      response_type: "code",
      scope: "identify guilds",
      state,
    });
    return reply.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });
  app.get("/auth/callback", async (req, reply) => {
    const { code, state } = z
      .object({ code: z.string(), state: z.string() })
      .parse(req.query);
    if (!equal(state, req.cookies.rl_oauth ?? "")) throw unauthorized();
    reply.clearCookie("rl_oauth", { path: "/" });
    const res = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.clientId ?? "",
        client_secret: settings.clientSecret ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: `${settings.publicUrl}/auth/callback`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("Discord-Anmeldung fehlgeschlagen.");
    const token = z
      .object({ access_token: z.string() })
      .parse(await res.json());
    const headers = { authorization: `Bearer ${token.access_token}` };
    const [u, g] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", {
        headers,
        signal: AbortSignal.timeout(15000),
      }),
      fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers,
        signal: AbortSignal.timeout(15000),
      }),
    ]);
    if (!u.ok || !g.ok)
      throw new Error("Discord-Berechtigungen konnten nicht geprüft werden.");
    const user = z.object({ id: z.string() }).parse(await u.json());
    const guilds = z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          permissions: z.string(),
          owner: z.boolean().optional(),
        }),
      )
      .parse(await g.json())
      .filter((g) => g.owner || (BigInt(g.permissions) & 40n) !== 0n);
    const session = secret();
    await repo.db.query(
      "INSERT INTO web_sessions(hash,user_id,guilds,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes')",
      [hash(session), user.id, JSON.stringify(guilds)],
    );
    reply.setCookie("rl_session", session, {
      httpOnly: true,
      sameSite: "strict",
      secure: settings.production,
      path: "/",
      maxAge: 900,
    });
    return reply.redirect("/");
  });
  async function session(cookieValue?: string) {
    if (!cookieValue) throw unauthorized();
    const s = (
      await repo.db.query<{
        user_id: string;
        guilds: { id: string; name: string }[];
      }>(
        "SELECT user_id,guilds FROM web_sessions WHERE hash=$1 AND expires_at>now()",
        [hash(cookieValue)],
      )
    )[0];
    if (!s) throw unauthorized();
    return s;
  }
  app.get("/api/v1/me", async (req) => session(req.cookies.rl_session));
  app.post("/auth/logout", async (req, reply) => {
    if (req.headers.origin !== settings.publicUrl) throw unauthorized();
    await repo.db.query("DELETE FROM web_sessions WHERE hash=$1", [
      hash(req.cookies.rl_session ?? ""),
    ]);
    reply.clearCookie("rl_session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/v1/guild/:guild/action", async (req) => {
    if (
      req.headers.origin !== settings.publicUrl ||
      req.headers["x-rocklea-request"] !== "1"
    )
      throw unauthorized();
    const s = await session(req.cookies.rl_session);
    const { guild } = z.object({ guild: z.string() }).parse(req.params);
    if (!s.guilds.some((g) => g.id === guild)) throw unauthorized();
    const v = z
      .object({
        action: z.string(),
        args: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(req.body);
    return (
      (await action(
        repo,
        guild,
        { id: s.user_id, admin: true },
        v.action,
        v.args,
      )) ?? { ok: true }
    );
  });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    );
    reply.header("Cache-Control", "no-store");
    return payload;
  });
  const web = resolve("dist/dashboard");
  if (existsSync(web)) await app.register(staticFiles, { root: web });
  app.get("/api/v1/request-id", async () => ({ id: randomUUID() }));
  return app;
}
