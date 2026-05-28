import { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SEO } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SEO.siteUrl;

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.95 },
    { url: `${baseUrl}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/faqs`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/shipping`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/returns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('slug, updated_at')
        .eq('status', 'active');

      if (products) {
        productPages = products.map((product) => ({
          url: `${baseUrl}/product/${product.slug}`,
          lastModified: product.updated_at ? new Date(product.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));
      }

      const { data: categories } = await supabaseAdmin
        .from('categories')
        .select('slug, updated_at')
        .eq('status', 'active');

      if (categories) {
        categoryPages = categories.map((category) => ({
          url: `${baseUrl}/shop?category=${encodeURIComponent(category.slug)}`,
          lastModified: category.updated_at ? new Date(category.updated_at) : new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.75,
        }));
      }
    } catch (error) {
      console.error('[Sitemap] Error:', error);
    }
  }

  return [...staticPages, ...productPages, ...categoryPages];
}
