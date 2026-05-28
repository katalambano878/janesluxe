import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildProductMetadata } from '@/lib/seo';
import ProductDetailClient from './ProductDetailClient';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return buildProductMetadata({
      name: 'Product',
      slug,
      price: 0,
      description: null,
    });
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select(
      `
      name,
      slug,
      description,
      price,
      categories(name),
      product_images(url, position)
    `
    )
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();

  if (!product) {
    return buildProductMetadata({
      name: 'Product Not Found',
      slug,
      price: 0,
      description: null,
    });
  }

  const images = Array.isArray(product.product_images)
    ? [...product.product_images].sort(
        (a: { position?: number }, b: { position?: number }) =>
          (Number(a.position) ?? 0) - (Number(b.position) ?? 0)
      )
    : [];

  return buildProductMetadata({
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: Number(product.price) || 0,
    image: images[0]?.url ?? null,
    category: (product.categories as { name?: string } | null)?.name ?? null,
  });
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} />;
}
