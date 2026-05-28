import { createClient } from '@supabase/supabase-js';

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : '';
}

const isDev = process.env.NODE_ENV !== 'production';

const supabaseUrl =
  readEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  (isDev ? 'https://placeholder.supabase.co' : '');

const supabaseKey =
  readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  (isDev ? 'placeholder-anon-key' : '');

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

/** True when real keys are configured (not local preview placeholders). */
export const isSupabaseConfigured =
  readEnv('NEXT_PUBLIC_SUPABASE_URL').length > 0 &&
  readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY').length > 0;

export const supabase = createClient(supabaseUrl, supabaseKey);
