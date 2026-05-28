import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Valid-format placeholders so the app never crashes on import when env is missing (e.g. Vercel). */
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : '';
}

const configuredUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const configuredKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

/** True when real Supabase keys are set in the environment. */
export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);

const supabaseUrl = configuredUrl || PLACEHOLDER_URL;
const supabaseKey = configuredKey || PLACEHOLDER_ANON_KEY;

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  console.warn(
    "[Jane's Luxe] Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables, then redeploy."
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
