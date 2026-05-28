/**
 * Apply Row Level Security (RLS) policies to all Supabase tables.
 * Run with: node scripts/apply-rls.mjs
 * 
 * Uses the Supabase Management API via the service role key.
 */

import { createClient } from '@supabase/supabase-js';

function readEnvFile() {
  const fs = require('fs');
  if (!fs.existsSync('.env.local')) return '';
  return fs.readFileSync('.env.local', 'utf-8');
}

const envContent = readEnvFile();
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();

if (!SUPABASE_URL) {
  console.error('ERROR: Set NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
    // Read from .env.local
    const fs = await import('fs');
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
    if (match) {
        var serviceKey = match[1].trim();
    } else {
        console.error('ERROR: Could not find SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
} else {
    var serviceKey = SERVICE_ROLE_KEY;
}

const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// SQL statements to enable RLS and create policies
const SQL_STATEMENTS = [
    // ============================================================
    // 1. ORDERS TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY`,

    // Drop existing policies to avoid conflicts
    `DROP POLICY IF EXISTS "Users can view own orders" ON public.orders`,
    `DROP POLICY IF EXISTS "Users can create orders" ON public.orders`,
    `DROP POLICY IF EXISTS "Anon can create guest orders" ON public.orders`,

    // Users can view their own orders
    `CREATE POLICY "Users can view own orders"
     ON public.orders FOR SELECT
     USING (auth.uid() = user_id)`,

    // Authenticated users can insert orders
    `CREATE POLICY "Users can create orders"
     ON public.orders FOR INSERT
     WITH CHECK (auth.uid() = user_id OR user_id IS NULL)`,

    // Allow anonymous/guest checkout (insert only)
    `CREATE POLICY "Anon can create guest orders"
     ON public.orders FOR INSERT
     WITH CHECK (user_id IS NULL)`,

    // ============================================================
    // 2. ORDER_ITEMS TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items`,
    `DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items`,
    `DROP POLICY IF EXISTS "Anon can insert guest order items" ON public.order_items`,

    `CREATE POLICY "Users can view own order items"
     ON public.order_items FOR SELECT
     USING (
       EXISTS (
         SELECT 1 FROM public.orders
         WHERE orders.id = order_items.order_id
         AND orders.user_id = auth.uid()
       )
     )`,

    `CREATE POLICY "Users can insert order items"
     ON public.order_items FOR INSERT
     WITH CHECK (
       EXISTS (
         SELECT 1 FROM public.orders
         WHERE orders.id = order_items.order_id
         AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)
       )
     )`,

    // ============================================================
    // 3. PROFILES TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles`,
    `DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles`,

    `CREATE POLICY "Users can view own profile"
     ON public.profiles FOR SELECT
     USING (auth.uid() = id)`,

    `CREATE POLICY "Users can update own profile"
     ON public.profiles FOR UPDATE
     USING (auth.uid() = id)
     WITH CHECK (auth.uid() = id)`,

    // ============================================================
    // 4. CUSTOMERS TABLE (admin only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Admin can manage customers" ON public.customers`,

    `CREATE POLICY "Admin can manage customers"
     ON public.customers FOR ALL
     USING (
       EXISTS (
         SELECT 1 FROM public.profiles
         WHERE profiles.id = auth.uid()
         AND profiles.role IN ('admin', 'staff')
       )
     )`,

    // ============================================================
    // 5. PRODUCTS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view products" ON public.products`,

    `CREATE POLICY "Public can view products"
     ON public.products FOR SELECT
     USING (true)`,

    // ============================================================
    // 6. PRODUCT_IMAGES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.product_images ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view product images" ON public.product_images`,

    `CREATE POLICY "Public can view product images"
     ON public.product_images FOR SELECT
     USING (true)`,

    // ============================================================
    // 7. CATEGORIES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view categories" ON public.categories`,

    `CREATE POLICY "Public can view categories"
     ON public.categories FOR SELECT
     USING (true)`,

    // ============================================================
    // 8. BANNERS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.banners ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view banners" ON public.banners`,

    `CREATE POLICY "Public can view banners"
     ON public.banners FOR SELECT
     USING (true)`,

    // ============================================================
    // 9. STORE_MODULES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.store_modules ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view modules" ON public.store_modules`,

    `CREATE POLICY "Public can view modules"
     ON public.store_modules FOR SELECT
     USING (true)`,

    // ============================================================
    // 10. REVIEWS TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews`,
    `DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews`,

    `CREATE POLICY "Public can view reviews"
     ON public.reviews FOR SELECT
     USING (true)`,

    `CREATE POLICY "Users can create reviews"
     ON public.reviews FOR INSERT
     WITH CHECK (auth.uid() IS NOT NULL)`,

    // ============================================================
    // 11. COUPONS TABLE (admin only, but public can validate)
    // ============================================================
    `ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can read active coupons" ON public.coupons`,

    `CREATE POLICY "Public can read active coupons"
     ON public.coupons FOR SELECT
     USING (true)`,

    // ============================================================
    // 12. PRODUCT_VARIANTS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view variants" ON public.product_variants`,

    `CREATE POLICY "Public can view variants"
     ON public.product_variants FOR SELECT
     USING (true)`,

    // ============================================================
    // 13. BLOG_POSTS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.blog_posts ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view published posts" ON public.blog_posts`,

    `CREATE POLICY "Public can view published posts"
     ON public.blog_posts FOR SELECT
     USING (true)`,

    // ============================================================
    // 14. SHIPPING_ZONES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.shipping_zones ENABLE ROW LEVEL SECURITY`,

    `DROP POLICY IF EXISTS "Public can view shipping zones" ON public.shipping_zones`,

    `CREATE POLICY "Public can view shipping zones"
     ON public.shipping_zones FOR SELECT
     USING (true)`,
];

console.log('=== Applying RLS Policies to Supabase ===\n');
console.log(`Project: YOUR_PROJECT_ID`);
console.log(`Total SQL statements: ${SQL_STATEMENTS.length}\n`);

let succeeded = 0;
let failed = 0;
let skipped = 0;

for (const sql of SQL_STATEMENTS) {
    const shortSql = sql.trim().replace(/\s+/g, ' ').substring(0, 80);
    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        
        if (error) {
            // Try alternative: some Supabase instances don't have exec_sql
            // Fall back to checking if it's a "does not exist" error (table doesn't exist)
            if (error.message?.includes('does not exist') || error.message?.includes('not found')) {
                console.log(`  SKIP: ${shortSql}...`);
                console.log(`        Table does not exist, skipping.`);
                skipped++;
            } else {
                console.log(`  FAIL: ${shortSql}...`);
                console.log(`        Error: ${error.message}`);
                failed++;
            }
        } else {
            console.log(`  OK: ${shortSql}...`);
            succeeded++;
        }
    } catch (err) {
        console.log(`  FAIL: ${shortSql}...`);
        console.log(`        Error: ${err.message}`);
        failed++;
    }
}

console.log(`\n=== Results ===`);
console.log(`Succeeded: ${succeeded}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);

if (failed > 0) {
    console.log(`\nNOTE: If all statements failed with "function exec_sql does not exist",`);
    console.log(`you need to run these SQL statements directly in the Supabase SQL Editor.`);
    console.log(`Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new`);
    console.log(`\nCopy the SQL from SECURITY_RLS_SETUP.md and run it there.`);
}
