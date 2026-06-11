import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/storefront/branches
 * Returns active branches for the storefront branch selector.
 */
export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('branches')
      .select('id, name, slug, address, phone, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[Storefront API] Branches error:', error);
      return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 });
    }

    return NextResponse.json(data || [], {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err: any) {
    console.error('[Storefront API] Branches error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
