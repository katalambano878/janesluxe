import { MetadataRoute } from 'next';
import { SEO } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SEO.siteUrl;
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/checkout',
          '/cart',
          '/account/',
        ],
      },
    ],
    host: baseUrl,
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
