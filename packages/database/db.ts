import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
export interface Query {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  exec(sql: string): Promise<void>;
}
export interface Database extends Query {
  transaction<T>(fn: (tx: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function database(url: string): Database {
  if (url.startsWith("pglite:")) {
    const db = new PGlite(url.slice(7) || undefined);
    const adapt = (q: Pick<PGlite, "query" | "exec">): Query => ({
      query: async <T>(s: string, p?: unknown[]) =>
        (await q.query<T>(s, p)).rows,
      exec: async (s) => {
        await q.exec(s);
      },
    });
    return {
      ...adapt(db),
      transaction: (fn) => db.transaction((tx) => fn(adapt(tx))),
      close: () => db.close(),
    };
  }
  const pool = new Pool({ connectionString: url, max: 10 });
  const query: Query["query"] = async <T>(s: string, p?: unknown[]) =>
    (await pool.query(s, p)).rows as T[];
  return {
    query,
    exec: async (s) => {
      await pool.query(s);
    },
    close: () => pool.end(),
    transaction: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const result = await fn({
          query: async <T>(s: string, p?: unknown[]) =>
            (await c.query(s, p)).rows as T[],
          exec: async (s) => {
            await c.query(s);
          },
        });
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
export async function migrate(db: Database) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir(resolve("packages/database/migrations")))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await db.transaction(async (tx) => {
      await tx.exec("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
      if (
        (
          await tx.query("SELECT name FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).length
      )
        return;
      await tx.exec(
        await readFile(resolve("packages/database/migrations", name), "utf8"),
      );
      await tx.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    });
  }
}
