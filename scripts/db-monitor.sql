-- Jane's Luxe — safe staging/production DB monitor (read-only)
-- Usage: psql "$DATABASE_URL" -f scripts/db-monitor.sql
-- Do NOT add terminate/kill statements here.

\echo '=== Connection usage ==='
SELECT
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
  count(*) AS total,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
FROM pg_stat_activity
WHERE datname = current_database();

\echo '=== Active queries (>1s) ==='
SELECT
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  now() - query_start AS duration,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query_summary
FROM pg_stat_activity
WHERE datname = current_database()
  AND state <> 'idle'
  AND pid <> pg_backend_pid()
  AND query_start < now() - interval '1 second'
ORDER BY query_start ASC
LIMIT 30;

\echo '=== Idle in transaction ==='
SELECT
  pid,
  usename,
  now() - xact_start AS tx_age,
  now() - state_change AS idle_age,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query_summary
FROM pg_stat_activity
WHERE datname = current_database()
  AND state = 'idle in transaction'
ORDER BY xact_start ASC
LIMIT 30;

\echo '=== Blocked / blocking ==='
SELECT
  blocked.pid AS blocked_pid,
  left(regexp_replace(blocked.query, '\s+', ' ', 'g'), 120) AS blocked_query,
  blocking.pid AS blocking_pid,
  left(regexp_replace(blocking.query, '\s+', ' ', 'g'), 120) AS blocking_query,
  now() - blocked.query_start AS wait_duration
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid AND NOT bl.granted
JOIN pg_locks kl ON kl.locktype = bl.locktype
  AND kl.database IS NOT DISTINCT FROM bl.database
  AND kl.relation IS NOT DISTINCT FROM bl.relation
  AND kl.page IS NOT DISTINCT FROM bl.page
  AND kl.tuple IS NOT DISTINCT FROM bl.tuple
  AND kl.virtualxid IS NOT DISTINCT FROM bl.virtualxid
  AND kl.transactionid IS NOT DISTINCT FROM bl.transactionid
  AND kl.classid IS NOT DISTINCT FROM bl.classid
  AND kl.objid IS NOT DISTINCT FROM bl.objid
  AND kl.objsubid IS NOT DISTINCT FROM bl.objsubid
  AND kl.granted
JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
WHERE blocked.datname = current_database();

\echo '=== Long-running transactions ==='
SELECT
  pid,
  usename,
  state,
  now() - xact_start AS tx_age,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query_summary
FROM pg_stat_activity
WHERE datname = current_database()
  AND xact_start IS NOT NULL
  AND xact_start < now() - interval '30 seconds'
ORDER BY xact_start ASC
LIMIT 20;
