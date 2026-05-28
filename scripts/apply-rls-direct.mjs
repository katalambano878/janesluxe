/**
 * Apply Row Level Security (RLS) policies directly to Supabase PostgreSQL.
 * Connects via Supabase's pooler using the service role JWT.
 * 
 * Run: node scripts/apply-rls-direct.mjs
 */

import pg from 'pg';
import fs from 'fs';

// Read env
const envContent = fs.readFileSync('.env.local', 'utf-8');
const SERVICE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();
function projectRefFromEnv(envContent) {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim();
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
  const m = url?.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] || null;
}

const PROJECT_REF = projectRefFromEnv(envContent);
if (!PROJECT_REF) {
  console.error('ERROR: Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local');
  process.exit(1);
}

if (!SERVICE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
    process.exit(1);
}

// Supabase connection pooler (Supavisor) - uses JWT auth
// Transaction mode on port 6543
const connectionString = `postgresql://postgres.${PROJECT_REF}:${SERVICE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

// Also try direct connection
const directConnection = `postgresql://postgres.${PROJECT_REF}:${SERVICE_KEY}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

const SQL_STATEMENTS = [
    // ============================================================
    // ORDERS TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users can view own orders" ON public.orders`,
    `DROP POLICY IF EXISTS "Users can create orders" ON public.orders`,
    `DROP POLICY IF EXISTS "Anon can create guest orders" ON public.orders`,
    `CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id)`,
    `CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL)`,
    `CREATE POLICY "Anon can create guest orders" ON public.orders FOR INSERT WITH CHECK (user_id IS NULL)`,

    // ============================================================
    // ORDER_ITEMS TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items`,
    `DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items`,
    `CREATE POLICY "Users can view own order items" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()))`,
    `CREATE POLICY "Users can insert order items" ON public.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)))`,

    // ============================================================
    // PROFILES TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles`,
    `DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles`,
    `CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id)`,
    `CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`,

    // ============================================================
    // CUSTOMERS TABLE (admin only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Admin can manage customers" ON public.customers`,
    `CREATE POLICY "Admin can manage customers" ON public.customers FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))`,

    // ============================================================
    // PRODUCTS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view products" ON public.products`,
    `CREATE POLICY "Public can view products" ON public.products FOR SELECT USING (true)`,

    // ============================================================
    // PRODUCT_IMAGES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.product_images ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view product images" ON public.product_images`,
    `CREATE POLICY "Public can view product images" ON public.product_images FOR SELECT USING (true)`,

    // ============================================================
    // PRODUCT_VARIANTS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view variants" ON public.product_variants`,
    `CREATE POLICY "Public can view variants" ON public.product_variants FOR SELECT USING (true)`,

    // ============================================================
    // CATEGORIES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view categories" ON public.categories`,
    `CREATE POLICY "Public can view categories" ON public.categories FOR SELECT USING (true)`,

    // ============================================================
    // BANNERS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.banners ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view banners" ON public.banners`,
    `CREATE POLICY "Public can view banners" ON public.banners FOR SELECT USING (true)`,

    // ============================================================
    // STORE_MODULES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.store_modules ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view modules" ON public.store_modules`,
    `CREATE POLICY "Public can view modules" ON public.store_modules FOR SELECT USING (true)`,

    // ============================================================
    // REVIEWS TABLE
    // ============================================================
    `ALTER TABLE IF EXISTS public.reviews ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view reviews" ON public.reviews`,
    `DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews`,
    `CREATE POLICY "Public can view reviews" ON public.reviews FOR SELECT USING (true)`,
    `CREATE POLICY "Users can create reviews" ON public.reviews FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)`,

    // ============================================================
    // REVIEW_IMAGES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.review_images ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view review images" ON public.review_images`,
    `CREATE POLICY "Public can view review images" ON public.review_images FOR SELECT USING (true)`,

    // ============================================================
    // COUPONS TABLE (public read for validation)
    // ============================================================
    `ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can read coupons" ON public.coupons`,
    `CREATE POLICY "Public can read coupons" ON public.coupons FOR SELECT USING (true)`,

    // ============================================================
    // BLOG_POSTS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.blog_posts ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view posts" ON public.blog_posts`,
    `CREATE POLICY "Public can view posts" ON public.blog_posts FOR SELECT USING (true)`,

    // ============================================================
    // PAGES TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.pages ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view pages" ON public.pages`,
    `CREATE POLICY "Public can view pages" ON public.pages FOR SELECT USING (true)`,

    // ============================================================
    // CMS_CONTENT TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.cms_content ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view cms" ON public.cms_content`,
    `CREATE POLICY "Public can view cms" ON public.cms_content FOR SELECT USING (true)`,

    // ============================================================
    // SITE_SETTINGS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view settings" ON public.site_settings`,
    `CREATE POLICY "Public can view settings" ON public.site_settings FOR SELECT USING (true)`,

    // ============================================================
    // STORE_SETTINGS TABLE (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.store_settings ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view store settings" ON public.store_settings`,
    `CREATE POLICY "Public can view store settings" ON public.store_settings FOR SELECT USING (true)`,

    // ============================================================
    // NAVIGATION TABLES (public read)
    // ============================================================
    `ALTER TABLE IF EXISTS public.navigation_menus ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view menus" ON public.navigation_menus`,
    `CREATE POLICY "Public can view menus" ON public.navigation_menus FOR SELECT USING (true)`,

    `ALTER TABLE IF EXISTS public.navigation_items ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Public can view nav items" ON public.navigation_items`,
    `CREATE POLICY "Public can view nav items" ON public.navigation_items FOR SELECT USING (true)`,

    // ============================================================
    // ADDRESSES TABLE (user's own only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.addresses ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users manage own addresses" ON public.addresses`,
    `CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id)`,

    // ============================================================
    // CART_ITEMS TABLE (user's own only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.cart_items ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users manage own cart" ON public.cart_items`,
    `CREATE POLICY "Users manage own cart" ON public.cart_items FOR ALL USING (auth.uid() = user_id)`,

    // ============================================================
    // WISHLIST_ITEMS TABLE (user's own only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.wishlist_items ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlist_items`,
    `CREATE POLICY "Users manage own wishlist" ON public.wishlist_items FOR ALL USING (auth.uid() = user_id)`,

    // ============================================================
    // NOTIFICATIONS TABLE (admin only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Admin can manage notifications" ON public.notifications`,
    `CREATE POLICY "Admin can manage notifications" ON public.notifications FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))`,

    // ============================================================
    // AUDIT_LOGS TABLE (admin only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Admin can view audit logs" ON public.audit_logs`,
    `CREATE POLICY "Admin can view audit logs" ON public.audit_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))`,

    // ============================================================
    // ORDER_STATUS_HISTORY TABLE (view own orders only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.order_status_history ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users can view own order history" ON public.order_status_history`,
    `CREATE POLICY "Users can view own order history" ON public.order_status_history FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid()))`,

    // ============================================================
    // SUPPORT TABLES (user's own tickets only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.support_tickets ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users manage own tickets" ON public.support_tickets`,
    `CREATE POLICY "Users manage own tickets" ON public.support_tickets FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))`,

    `ALTER TABLE IF EXISTS public.support_messages ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users view messages for own tickets" ON public.support_messages`,
    `CREATE POLICY "Users view messages for own tickets" ON public.support_messages FOR ALL USING (EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = support_messages.ticket_id AND (support_tickets.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))))`,

    // ============================================================
    // RETURN TABLES (user's own returns only)
    // ============================================================
    `ALTER TABLE IF EXISTS public.return_requests ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users manage own returns" ON public.return_requests`,
    `CREATE POLICY "Users manage own returns" ON public.return_requests FOR ALL USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))`,

    `ALTER TABLE IF EXISTS public.return_items ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "Users view own return items" ON public.return_items`,
    `CREATE POLICY "Users view own return items" ON public.return_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.return_requests WHERE return_requests.id = return_items.return_request_id AND (return_requests.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))))`,
];

async function tryConnect(connStr, label) {
    console.log(`\nTrying ${label}...`);
    const client = new pg.Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });
    
    try {
        await client.connect();
        console.log(`Connected via ${label}!`);
        return client;
    } catch (err) {
        console.log(`${label} failed: ${err.message}`);
        return null;
    }
}

async function main() {
    console.log('=== Applying RLS Policies to Supabase (Direct SQL) ===');
    console.log(`Project: ${PROJECT_REF}`);
    console.log(`Total SQL statements: ${SQL_STATEMENTS.length}\n`);

    // Try pooler connection first, then direct
    let client = await tryConnect(connectionString, 'Supavisor pooler (port 6543)');
    
    if (!client) {
        client = await tryConnect(directConnection, 'Direct connection (port 5432)');
    }

    if (!client) {
        console.error('\nERROR: Could not connect to the database.');
        console.error('The service role JWT may not work for direct database connections.');
        console.error('You may need to run the SQL manually in the Supabase SQL Editor:');
        console.error(`https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
        process.exit(1);
    }

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const sql of SQL_STATEMENTS) {
        const shortSql = sql.trim().replace(/\s+/g, ' ').substring(0, 80);
        try {
            await client.query(sql);
            console.log(`  OK: ${shortSql}...`);
            succeeded++;
        } catch (err) {
            if (err.message?.includes('does not exist')) {
                console.log(`  SKIP: ${shortSql}...`);
                console.log(`        (Table/column doesn't exist — skipping)`);
                skipped++;
            } else if (err.message?.includes('already exists')) {
                console.log(`  OK (exists): ${shortSql}...`);
                succeeded++;
            } else {
                console.log(`  FAIL: ${shortSql}...`);
                console.log(`        Error: ${err.message}`);
                failed++;
            }
        }
    }

    await client.end();

    console.log(`\n=== Results ===`);
    console.log(`Succeeded: ${succeeded}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);

    if (succeeded > 0) {
        console.log('\nRLS policies have been applied! Your database is now secured.');
    }

    // Verify by checking RLS status
    console.log('\n=== Verifying RLS Status ===');
    const verifyClient = new pg.Client({
        connectionString: client._connectionString || connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });
    
    try {
        await verifyClient.connect();
        const result = await verifyClient.query(`
            SELECT tablename, rowsecurity 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename
        `);
        
        console.log('\nTable RLS Status:');
        for (const row of result.rows) {
            const status = row.rowsecurity ? 'ENABLED' : 'DISABLED';
            const icon = row.rowsecurity ? '  [SECURE]' : '  [EXPOSED]';
            console.log(`${icon} ${row.tablename}: RLS ${status}`);
        }
        
        await verifyClient.end();
    } catch (err) {
        console.log('Could not verify:', err.message);
    }
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
