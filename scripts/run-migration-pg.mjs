/**
 * Apply full schema migration using service role (direct Postgres).
 */
import pg from 'pg';
import fs from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const path = resolve(process.cwd(), '.env.local');
  const content = fs.readFileSync(path, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const ref =
  env.SUPABASE_PROJECT_REF ||
  env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!ref || !key) {
  console.error('Missing SUPABASE URL or service role key in .env.local');
  process.exit(1);
}

const sql = fs.readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260209000000_complete_schema.sql'),
  'utf8'
);

const regions = [
  'us-east-1',
  'us-west-1',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
  'sa-east-1',
];

const candidates = [
  ...regions.map(
    (r) =>
      `postgresql://postgres.${ref}:${key}@aws-0-${r}.pooler.supabase.com:6543/postgres`
  ),
  ...regions.map(
    (r) =>
      `postgresql://postgres.${ref}:${key}@aws-0-${r}.pooler.supabase.com:5432/postgres`
  ),
  `postgresql://postgres.${ref}:${key}@db.${ref}.supabase.co:5432/postgres`,
];

async function tryConnect(connStr) {
  const client = new pg.Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return client;
  } catch {
    try {
      await client.end();
    } catch {}
    return null;
  }
}

let client = null;
for (const connStr of candidates) {
  const label = connStr.replace(/:[^@]+@/, ':***@');
  process.stdout.write(`Trying ${label} ... `);
  client = await tryConnect(connStr);
  if (client) {
    console.log('OK');
    break;
  }
  console.log('fail');
}

if (!client) {
  console.error('Could not connect with service role JWT to any pooler region.');
  process.exit(1);
}

try {
  console.log('Applying migration...');
  await client.query(sql);
  console.log('Migration applied successfully.');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
