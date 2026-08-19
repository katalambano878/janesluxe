import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/admin/upload
 * multipart/form-data: "file" + optional "bucket".
 * Images are auto-compressed in the storage layer (sharp).
 */
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

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

    const originalName = (file as File).name || 'upload.bin';
    const originalType = file.type || '';
    const isVideo =
      originalType.startsWith('video/') ||
      /\.(mp4|mov|webm|m4v)$/i.test(originalName);

    const MAX_BYTES = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: isVideo
            ? 'Video too large (max 100MB)'
            : 'Image too large (max 20MB). It will be compressed automatically on upload.',
        },
        { status: 400 }
      );
    }

    const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `cat-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buf, {
      contentType: originalType || undefined,
      cacheControl: '31536000',
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
