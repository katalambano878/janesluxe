import { NextResponse } from 'next/server';
import { isPlainPostgres } from '@/lib/db/mode';
import { getPool, getPoolStats, query } from '@/lib/db/pool';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public liveness/readiness probe.
 * Does not expose credentials, hosts, or row contents.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, 'ok' | 'degraded' | 'fail' | 'skip'> = {
    app: 'ok',
    database: 'skip',
    requiredTables: 'skip',
    env: 'ok',
  };

  const missing: string[] = [];
  if (!process.env.AUTH_JWT_SECRET && !process.env.JWT_SECRET) missing.push('AUTH_JWT_SECRET');
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) missing.push('DATABASE_URL');
  if (missing.length) checks.env = 'degraded';

  let dbLatencyMs: number | null = null;
  let pool: ReturnType<typeof getPoolStats> | null = null;

  let requiredTables: 'ok' | 'degraded' | 'fail' | 'skip' = 'skip';
  if (isPlainPostgres()) {
    try {
      const t0 = Date.now();
      await query('SELECT 1 AS ok');
      dbLatencyMs = Date.now() - t0;
      pool = getPoolStats();
      checks.database = dbLatencyMs > 2000 ? 'degraded' : 'ok';
      void getPool();

      const { rows } = await query<{ missing: number }>(`
        SELECT COUNT(*)::int AS missing
        FROM (VALUES
          ('orders'),('order_items'),('products'),('profiles'),('customers'),
          ('branches'),('branch_inventory'),('payment_webhook_events'),('schema_migrations')
        ) AS required(name)
        WHERE NOT EXISTS (
          SELECT 1 FROM information_schema.tables t
          WHERE t.table_schema = 'public' AND t.table_name = required.name
        )
      `);
      requiredTables = (rows[0]?.missing || 0) > 0 ? 'fail' : 'ok';
      checks.requiredTables = requiredTables;
    } catch {
      checks.database = 'fail';
      checks.requiredTables = 'fail';
    }
  }

  const status =
    checks.database === 'fail' || checks.env === 'fail' || checks.requiredTables === 'fail'
      ? 'unhealthy'
      : checks.database === 'degraded' || checks.env === 'degraded'
        ? 'degraded'
        : 'healthy';

  return NextResponse.json(
    {
      status,
      checks,
      dbLatencyMs,
      pool,
      missingEnv: missing,
      durationMs: Date.now() - started,
      ts: new Date().toISOString(),
    },
    { status: status === 'unhealthy' ? 503 : 200 }
  );
}
