#!/usr/bin/env node
/**
 * Instructions to run the full e-commerce schema migration against Supabase.
 *
 * The migration file is: supabase/migrations/20260209000000_complete_schema.sql
 *
 * Option A - Supabase Dashboard (recommended):
 *   1. Open https://supabase.com/dashboard → your project → SQL Editor
 *   2. Paste the entire contents of the migration file
 *   3. Run the query
 *
 * Option B - Supabase CLI:
 *   npx supabase link --project-ref YOUR_REF
 *   npx supabase db push
 *
 * Option C - If you have direct DB URL (e.g. from Supabase Settings → Database):
 *   psql "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" -f supabase/migrations/20260209000000_complete_schema.sql
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationPath = join(root, 'supabase', 'migrations', '20260209000000_complete_schema.sql');

console.log('Full migration file:', migrationPath);
console.log('\nRun this file in Supabase Dashboard → SQL Editor (paste contents and execute).');
console.log('Or use Supabase CLI: npx supabase db push');
