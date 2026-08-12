// Shared Postgres connection pool for the app's in-process backend.
//
// Replaces the Supabase/PostgREST data plane. Every ported edge function talks
// to Postgres through the supabase-compat client, which uses this pool.

import { Pool, types, type PoolClient } from "pg";

// --- PostgREST-faithful type parsing ---------------------------------------
// Supabase (PostgREST) serializes these as JSON strings/numbers; node-postgres
// defaults to JS Date objects and strings, which breaks code that compares
// `due_date === "2026-06-17"` or does arithmetic on numeric columns.
types.setTypeParser(1082, (v: string) => v); // date -> "YYYY-MM-DD"
types.setTypeParser(1114, (v: string) => (v ? v.replace(" ", "T") : v)); // timestamp
types.setTypeParser(1184, (v: string) => {
  // timestamptz "2026-06-17 12:34:56.789+00" -> "2026-06-17T12:34:56.789+00:00"
  if (!v) return v;
  let s = v.replace(" ", "T");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  return s;
});
types.setTypeParser(1700, (v: string | null) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v: string | null) => (v === null ? null : parseInt(v, 10))); // int8

let _pool: Pool | null = null;

const STATEMENT_TIMEOUT_MS = Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15_000);
const LOCK_TIMEOUT_MS = Number(process.env.PG_LOCK_TIMEOUT_MS || 5_000);
const IDLE_IN_TX_MS = Number(process.env.PG_IDLE_IN_TX_MS || 30_000);
const CONNECT_TIMEOUT_MS = Number(process.env.PG_CONNECT_TIMEOUT_MS || 5_000);

export function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "";
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set, so the Postgres backend cannot start."
    );
  }
  _pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    allowExitOnIdle: false,
    // Self-hosted Postgres on the same host / private network: TLS optional.
    ssl:
      process.env.PGSSL === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  _pool.on("error", (err) => {
    console.error("[pg-pool] idle client error:", err.message);
  });

  _pool.on("connect", (client) => {
    // Bound every connection so runaway SQL cannot hold the pool forever.
    void (async () => {
      try {
        await client.query(`SET statement_timeout = ${Math.max(1000, STATEMENT_TIMEOUT_MS)}`);
        await client.query(`SET lock_timeout = ${Math.max(500, LOCK_TIMEOUT_MS)}`);
        await client.query(
          `SET idle_in_transaction_session_timeout = ${Math.max(1000, IDLE_IN_TX_MS)}`
        );
      } catch (err: any) {
        console.warn("[pg-pool] failed to set session timeouts:", err?.message || err);
      }
    })();
  });

  return _pool;
}

export async function query<T = any>(
  text: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  const pool = getPool();
  const res = await pool.query(text, params as any[]);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

/** Acquire a client with guaranteed release (use for multi-statement work). */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Short transaction helper — never hold across external HTTP calls. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback errors */
      }
      throw err;
    }
  });
}

export function getPoolStats() {
  const pool = getPool();
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max: Number(process.env.PG_POOL_MAX || 10),
    statementTimeoutMs: STATEMENT_TIMEOUT_MS,
    lockTimeoutMs: LOCK_TIMEOUT_MS,
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
  };
}
