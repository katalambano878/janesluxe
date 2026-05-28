import { NextResponse } from 'next/server';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/storefront/modules
 *
 * Public, read-only endpoint exposing a safe subset of store feature flags
 * for the storefront (e.g. maintenance mode, AI chat).
 */
export async function GET() {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json([]);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('store_modules')
      .select('id, enabled')
      .in('id', ['ai-chat', 'maintenance-mode']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to load modules' },
      { status: 500 },
    );
  }
}

