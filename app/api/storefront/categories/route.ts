import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// No in-memory cache — newly created categories must appear instantly on the
// storefront. CDN/browser caching is still controlled via Cache-Control below.
export const dynamic = 'force-dynamic';

export async function GET() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('categories')
            .select('id, name, slug, image_url, parent_id, position, metadata')
            .eq('status', 'active')
            .order('position', { ascending: true })
            .order('name', { ascending: true });

        if (error) {
            console.error('[Storefront API] Categories error:', error);
            return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
        }

        return NextResponse.json(data, {
            headers: {
                // Short edge cache so new categories show up almost immediately
                // while still benefiting from CDN.
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (err: any) {
        console.error('[Storefront API] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
