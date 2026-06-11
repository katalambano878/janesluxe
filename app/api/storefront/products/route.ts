import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
    BRANCH_INVENTORY_SELECT,
    resolveBranchId,
    getHiddenProductIdsForBranch,
    applyBranchVisibilityFilter,
    applyBranchQuantity,
} from '@/lib/branch-server';

// No in-memory cache — newly created/featured products must show up
// immediately on the storefront. CDN/browser caching is still controlled
// via the Cache-Control header below.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const category = searchParams.get('category');
    const branchParam = searchParams.get('branch');

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
    }

    try {
        const filterByCategory = Boolean(category);
        const categorySelect = filterByCategory
            ? 'categories!inner(id, name, slug)'
            : 'categories(id, name, slug)';

        const branchId = await resolveBranchId(branchParam);

        let query = supabaseAdmin
            .from('products')
            .select(`
                id, name, slug, price, compare_at_price, quantity, track_quantity, continue_selling, description, metadata, featured, moq, rating_avg,
                ${categorySelect},
                product_images(url, position),
                product_variants(id, name, price, quantity, option2),
                ${BRANCH_INVENTORY_SELECT}
            `)
            .order('created_at', { ascending: false })
            .eq('status', 'active');

        if (featured) {
            query = query.eq('featured', true);
        }

        if (filterByCategory) {
            query = query.eq('categories.slug', category);
        }

        if (branchId) {
            const hiddenIds = await getHiddenProductIdsForBranch(branchId);
            query = applyBranchVisibilityFilter(query, hiddenIds);
        }

        query = query.limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('[Storefront API] Products error:', error);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }

        const payload = branchId ? applyBranchQuantity(data || [], branchId) : data;

        return NextResponse.json(payload, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (err: any) {
        console.error('[Storefront API] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
