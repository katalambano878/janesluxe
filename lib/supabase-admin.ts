import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with service role key.
 * ONLY use this in API routes and server actions — NEVER in client components.
 * This bypasses RLS, so always verify the caller is authorized first.
 */

const isDev = process.env.NODE_ENV !== 'production';
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  (isDev ? 'https://placeholder.supabase.co' : '');
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  (isDev ? 'placeholder-service-role-key' : '');

if (!supabaseUrl && !isDev) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
}

export const isSupabaseAdminConfigured = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
);

if (!isSupabaseAdminConfigured && isDev) {
  console.warn(
    'SUPABASE_SERVICE_ROLE_KEY not set — API routes will return empty data until configured.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
