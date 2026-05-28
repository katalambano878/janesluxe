import type { Metadata } from 'next';
import {
  SITE_NAME,
  SITE_URL,
  SITE_TAGLINE,
  CONTACT_EMAIL,
  CONTACT_PHONE_DODOWA,
  CONTACT_ADDRESS_DODOWA,
  CONTACT_ADDRESS_MADINA,
  SOCIAL_INSTAGRAM,
  SOCIAL_TIKTOK,
  OG_IMAGE_PATH,
} from '@/lib/site-config';

/** Canonical SEO — always used instead of CMS placeholders */
export const SEO = {
  siteName: SITE_NAME,
  siteUrl: SITE_URL,
  tagline: SITE_TAGLINE,
  defaultTitle: `${SITE_NAME} | Women's Footwear & Fashion in Ghana`,
  defaultDescription:
    "Shop elegant heels, slippers, sneakers, sandals, platforms & dresses at Jane's Luxe. Curated feminine fashion for modern Ghanaian women — Dodowa & Madina Market, Accra. Nationwide delivery.",
  defaultKeywords: [
    "Jane's Luxe",
    "Janes Luxe",
    "women's footwear Ghana",
    "heels Accra",
    "ladies shoes Ghana",
    "fashion boutique Accra",
    "Dodowa Market shoes",
    "Madina Market footwear",
    "women's dresses Ghana",
    "slippers Ghana",
    "sneakers women",
    "elegant fashion Ghana",
    "buy heels online Ghana",
    "Ghanaian fashion brand",
  ],
  locale: 'en_GH',
  region: 'GH',
  currency: 'GHS',
  ogImage: OG_IMAGE_PATH,
  twitterImage: '/twitter-image.png',
  logo: '/logo.png',
  email: CONTACT_EMAIL,
  phone: `+233${CONTACT_PHONE_DODOWA.replace(/^0/, '')}`,
  addresses: [CONTACT_ADDRESS_DODOWA, CONTACT_ADDRESS_MADINA],
  social: {
    instagram: `https://www.instagram.com/${SOCIAL_INSTAGRAM.replace('@', '')}`,
    tiktok: `https://www.tiktok.com/@${SOCIAL_TIKTOK.replace('@', '')}`,
  },
} as const;

export type PageSeoKey =
  | 'home'
  | 'shop'
  | 'categories'
  | 'about'
  | 'contact'
  | 'cart'
  | 'checkout'
  | 'wishlist'
  | 'faqs'
  | 'shipping'
  | 'returns'
  | 'privacy'
  | 'terms'
  | 'blog';

export const PAGE_SEO: Record<
  PageSeoKey,
  { title: string; description: string; path: string; keywords?: string[] }
> = {
  home: {
    title: `${SITE_NAME} | Elegant Footwear & Fashion For Modern Women`,
    description: SEO.defaultDescription,
    path: '/',
    keywords: ['women footwear', 'fashion Ghana', 'heels', 'dresses'],
  },
  shop: {
    title: `Shop Women's Footwear & Fashion`,
    description:
      "Browse Jane's Luxe collections — heels, slippers, sneakers, sandals, platforms & dresses. Quality styles, affordable prices, delivery across Ghana.",
    path: '/shop',
    keywords: ['shop shoes Ghana', 'buy fashion online', "women's collection"],
  },
  categories: {
    title: `Shop by Category`,
    description:
      "Explore Jane's Luxe categories: heels, slippers, sneakers, sandals, flats & dresses. Find your perfect style for work, events & everyday comfort.",
    path: '/categories',
  },
  about: {
    title: `Our Story`,
    description:
      "Jane's Luxe is a Ghanaian fashion brand for confident women. Footwear-first boutique at Dodowa & Madina Market, Accra — elegance, comfort & everyday style.",
    path: '/about',
  },
  contact: {
    title: `Contact Us`,
    description:
      "Reach Jane's Luxe at Dodowa Market & Madina Market, Accra. Call, WhatsApp or email for orders, sizing help & delivery across Ghana.",
    path: '/contact',
  },
  cart: {
    title: `Shopping Cart`,
    description: `Review your Jane's Luxe cart and checkout securely with delivery across Ghana.`,
    path: '/cart',
    keywords: [],
  },
  checkout: {
    title: `Checkout`,
    description: `Complete your Jane's Luxe order — secure checkout and nationwide delivery in Ghana.`,
    path: '/checkout',
    keywords: [],
  },
  wishlist: {
    title: `Wishlist`,
    description: `Save your favourite Jane's Luxe heels, slippers & fashion pieces to your wishlist.`,
    path: '/wishlist',
  },
  faqs: {
    title: `FAQs`,
    description: `Answers about Jane's Luxe orders, sizing, delivery, returns & payments in Ghana.`,
    path: '/faqs',
  },
  shipping: {
    title: `Shipping & Delivery`,
    description: `Jane's Luxe delivery information — nationwide shipping across Ghana from Accra.`,
    path: '/shipping',
  },
  returns: {
    title: `Returns Policy`,
    description: `How to return or exchange items at Jane's Luxe — simple returns for Ghana customers.`,
    path: '/returns',
  },
  privacy: {
    title: `Privacy Policy`,
    description: `How Jane's Luxe collects and protects your personal information when you shop online.`,
    path: '/privacy',
  },
  terms: {
    title: `Terms of Service`,
    description: `Terms and conditions for shopping at Jane's Luxe online store in Ghana.`,
    path: '/terms',
  },
  blog: {
    title: `Style Journal`,
    description: `Fashion tips, footwear trends & style inspiration from Jane's Luxe Ghana.`,
    path: '/blog',
  },
};

function absoluteUrl(path: string): string {
  const base = SEO.siteUrl.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function imageUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return absoluteUrl(path);
}

export function buildPageMetadata(
  key: PageSeoKey,
  overrides?: Partial<{
    title: string;
    description: string;
    path: string;
    keywords: string[];
    ogImage: string;
    noindex: boolean;
  }>
): Metadata {
  const page = PAGE_SEO[key];
  const title = overrides?.title ?? page.title;
  const description = overrides?.description ?? page.description;
  const path = overrides?.path ?? page.path;
  const canonical = absoluteUrl(path);
  const ogImage = imageUrl(overrides?.ogImage ?? SEO.ogImage);
  const keywords = [...SEO.defaultKeywords, ...(overrides?.keywords ?? page.keywords ?? [])];

  return {
    title,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      locale: SEO.locale,
      url: canonical,
      title,
      description,
      siteName: SEO.siteName,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${SEO.siteName} — ${SITE_TAGLINE}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl(overrides?.ogImage ?? SEO.twitterImage)],
    },
    robots: overrides?.noindex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
          },
        },
  };
}

export function buildRootMetadata(): Metadata {
  const home = PAGE_SEO.home;
  const canonical = absoluteUrl('/');
  const ogImage = imageUrl(SEO.ogImage);

  return {
    metadataBase: new URL(SEO.siteUrl),
    applicationName: SEO.siteName,
    category: 'shopping',
    referrer: 'origin-when-cross-origin',
    title: {
      default: home.title,
      template: `%s | ${SEO.siteName}`,
    },
    description: home.description,
    keywords: [...SEO.defaultKeywords],
    authors: [{ name: SEO.siteName, url: canonical }],
    creator: SEO.siteName,
    publisher: SEO.siteName,
    formatDetection: { telephone: true, email: true },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
        { url: '/favicon/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/favicon/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
      shortcut: ['/favicon.ico'],
    },
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: SEO.siteName,
    },
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    },
    openGraph: {
      type: 'website',
      locale: SEO.locale,
      url: canonical,
      title: home.title,
      description: home.description,
      siteName: SEO.siteName,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${SEO.siteName} — Step Into Luxury`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: home.title,
      description: home.description,
      images: [imageUrl(SEO.twitterImage)],
      creator: `@${SOCIAL_INSTAGRAM.replace('@', '')}`,
    },
    alternates: {
      canonical,
    },
    other: {
      'geo.region': SEO.region,
      'geo.placename': 'Accra',
      'og:phone_number': SEO.phone,
      'contact:email': SEO.email,
    },
  };
}

export function buildProductMetadata(product: {
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  image?: string | null;
  category?: string | null;
  inStock?: boolean;
}): Metadata {
  const title = `${product.name} — ${product.category || 'Footwear'}`;
  const desc =
    product.description?.replace(/<[^>]+>/g, '').slice(0, 155) ||
    `Buy ${product.name} at Jane's Luxe. Premium women's footwear & fashion in Ghana — GH₵${product.price.toLocaleString('en-GH')}. Nationwide delivery.`;
  const path = `/product/${product.slug}`;
  const ogImage = product.image?.startsWith('http')
    ? product.image
    : product.image
      ? imageUrl(product.image)
      : imageUrl(SEO.ogImage);

  return {
    ...buildPageMetadata('shop', {
      title,
      description: desc,
      path,
      ogImage,
    }),
    openGraph: {
      type: 'website',
      locale: SEO.locale,
      url: absoluteUrl(path),
      title,
      description: desc,
      siteName: SEO.siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: product.name }],
    },
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SEO.siteUrl}#organization`,
        name: SEO.siteName,
        url: SEO.siteUrl,
        logo: imageUrl(SEO.logo),
        image: imageUrl(SEO.ogImage),
        description: SEO.defaultDescription,
        email: SEO.email,
        telephone: SEO.phone,
        sameAs: [SEO.social.instagram, SEO.social.tiktok],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          telephone: SEO.phone,
          email: SEO.email,
          availableLanguage: ['English'],
          areaServed: 'GH',
        },
      },
      {
        '@type': 'ClothingStore',
        '@id': `${SEO.siteUrl}#store`,
        name: SEO.siteName,
        url: SEO.siteUrl,
        image: imageUrl(SEO.ogImage),
        telephone: SEO.phone,
        priceRange: '$$',
        currenciesAccepted: 'GHS',
        paymentAccepted: 'Cash, Mobile Money, Card',
        address: SEO.addresses.map((name) => ({
          '@type': 'PostalAddress',
          streetAddress: name,
          addressLocality: 'Accra',
          addressRegion: 'Greater Accra',
          addressCountry: 'GH',
        })),
        areaServed: { '@type': 'Country', name: 'Ghana' },
        openingHoursSpecification: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          opens: '08:00',
          closes: '18:00',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${SEO.siteUrl}#website`,
        url: SEO.siteUrl,
        name: SEO.siteName,
        publisher: { '@id': `${SEO.siteUrl}#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SEO.siteUrl}/shop?search={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };
}
