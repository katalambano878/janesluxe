import { Metadata } from 'next';
import { SEO, buildPageMetadata, organizationJsonLd, type PageSeoKey } from '@/lib/seo';
import { SITE_NAME } from '@/lib/site-config';

export { buildPageMetadata, buildProductMetadata, organizationJsonLd } from '@/lib/seo';
export type { PageSeoKey };

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
  ogType?: 'website' | 'article';
  path?: string;
  publishedTime?: string;
  author?: string;
  noindex?: boolean;
}

/** @deprecated Prefer buildPageMetadata / buildProductMetadata from lib/seo */
export function generateMetadata({
  title = SEO.defaultTitle,
  description = SEO.defaultDescription,
  keywords = [],
  ogImage,
  ogType = 'website',
  path = '/',
  publishedTime,
  author,
  noindex = false,
}: SEOProps): Metadata {
  const base = buildPageMetadata('home', {
    title,
    description,
    path,
    keywords,
    ogImage,
    noindex,
  });

  if (ogType === 'article' && publishedTime) {
    return {
      ...base,
      openGraph: {
        ...base.openGraph,
        type: 'article',
        publishedTime,
        authors: author ? [author] : undefined,
      },
    };
  }

  return base;
}

export function generateProductSchema(product: {
  name: string;
  description: string;
  image: string;
  price: number;
  currency?: string;
  sku: string;
  rating?: number;
  reviewCount?: number;
  availability?: string;
  brand?: string;
  category?: string;
  url?: string;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku,
    brand: {
      '@type': 'Brand',
      name: product.brand || SITE_NAME,
    },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.currency || SEO.currency,
      availability:
        product.availability === 'in_stock'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      url: product.url || '',
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      seller: { '@type': 'Organization', name: SITE_NAME },
    },
  };

  if (product.rating && product.reviewCount) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (product.category) {
    schema.category = product.category;
  }

  return schema;
}

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function generateOrganizationSchema() {
  return organizationJsonLd()['@graph'][0];
}

export function generateWebsiteSchema() {
  return organizationJsonLd()['@graph'][2];
}

export function StructuredData({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
