import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { isPlainPostgres } from './db/mode';
import { createClient as createPgClient } from './db/supabase-compat';

/**
 * Server-side admin client.
 * - Plain Postgres (DATABASE_URL set): in-process pg compat + auth/storage shims
 * - Otherwise: hosted Supabase service-role client
 *
 * ONLY use in API routes / server actions — never in client components.
 */

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_SERVICE_KEY = 'placeholder-service-role-key';

export const isSupabaseAdminConfigured = Boolean(
  isPlainPostgres() ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
);

function createAdminClient() {
  if (isPlainPostgres()) {
    return createPgClient();
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || PLACEHOLDER_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || PLACEHOLDER_SERVICE_KEY;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error(
      'CRITICAL: Missing SUPABASE_SERVICE_ROLE_KEY — admin operations will fail'
    );
  }

  return createSupabaseJsClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabaseAdmin = createAdminClient();
