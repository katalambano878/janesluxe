import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase-admin';
import { verifyAuth } from '@/lib/auth';
import { isPlainPostgres } from '@/lib/db/mode';

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  if (!isSupabaseAdminConfigured && !isPlainPostgres()) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  const auth = await verifyAuth(request, { requireAdmin: true });
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Not authenticated' }, { status: 401 });
  }
  return null;
}

/**
 * POST /api/admin/upload
 * Body: multipart/form-data with field "file" (and optional "bucket", default "product-images").
 * Returns { url: string } public URL.
 */
export async function POST(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const ALLOWED_BUCKETS = new Set([
      'product-images',
      'category-images',
      'avatars',
      'blog-covers',
      'blog-images',
      'cms-images',
      'banners',
      'review-images',
      'site-media',
    ]);
    const rawBucket = (formData.get('bucket') as string) || 'product-images';
    const bucket = ALLOWED_BUCKETS.has(rawBucket) ? rawBucket : 'product-images';

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `cat-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 });
  }
}
