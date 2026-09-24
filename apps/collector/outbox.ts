import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { type Delivery, type Envelope } from "../../packages/shared/model.js";
import { canonical, hash } from "../../packages/shared/crypto.js";
export class OutboxFullError extends Error {
  constructor() {
    super("Offline-Puffer voll.");
    this.name = "OutboxFullError";
  }
}
export class Outbox {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS occurrences(fingerprint TEXT PRIMARY KEY,n INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    );
  }
  put(event: Envelope, occurredAt = new Date().toISOString()) {
    if (this.depth() >= 100000) throw new OutboxFullError();
    const matchPrefix = `${String(event.Data.MatchGuid)}:`;
    const fingerprint = matchPrefix + hash(canonical(event));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let ordinal = 1;
      if (
        ["GoalScored", "BallHit", "StatfeedEvent", "CrossbarHit"].includes(
          event.Event,
        )
      ) {
        this.db
          .prepare(
            "INSERT INTO occurrences(fingerprint,n) VALUES(?,1) ON CONFLICT(fingerprint) DO UPDATE SET n=n+1",
          )
          .run(fingerprint);
        ordinal = Number(
          this.db
            .prepare("SELECT n FROM occurrences WHERE fingerprint=?")
            .get(fingerprint)?.n,
        );
      }
      const item: Delivery = { id: randomUUID(), event, occurredAt, ordinal };
      this.db
        .prepare("INSERT INTO outbox(id,payload) VALUES(?,?)")
        .run(item.id, JSON.stringify(item));
      if (event.Event === "MatchDestroyed")
        this.db
          .prepare("DELETE FROM occurrences WHERE substr(fingerprint,1,?)=?")
          .run(matchPrefix.length, matchPrefix);
      this.db.exec("COMMIT");
      return item;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  batch(limit = 50): Delivery[] {
    return this.db
      .prepare("SELECT payload FROM outbox ORDER BY seq LIMIT ?")
      .all(limit)
      .map((r) => JSON.parse(String(r.payload)) as Delivery);
  }
  ack(ids: string[]) {
    this.db.exec("BEGIN");
    try {
      const stmt = this.db.prepare("DELETE FROM outbox WHERE id=?");
      for (const id of ids) stmt.run(id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  depth() {
    return Number(
      this.db.prepare("SELECT count(*) n FROM outbox").get()?.n ?? 0,
    );
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  get<T>(key: string): T | undefined {
    const v = this.db
      .prepare("SELECT value FROM metadata WHERE key=?")
      .get(key);
    return v ? (JSON.parse(String(v.value)) as T) : undefined;
  }
  close() {
    this.db.close();
  }
}
export function backoff(attempt: number) {
  return (
    Math.min(60000, 1000 * 2 ** Math.min(attempt, 6)) +
    Math.floor(Math.random() * 500)
  );
}
export async function flush(
  outbox: Outbox,
  send: (batch: Delivery[]) => Promise<{ accepted: string[] }>,
) {
  const batch = outbox.batch();
  if (!batch.length) return 0;
  const result = await send(batch);
  const sent = new Set(batch.map((b) => b.id));
  outbox.ack(result.accepted.filter((id) => sent.has(id)));
  return result.accepted.length;
}
