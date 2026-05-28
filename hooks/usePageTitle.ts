'use client';

import { useEffect } from 'react';
import { PAGE_SEO } from '@/lib/seo';
import { SITE_NAME } from '@/lib/site-config';

type PageKey = keyof typeof PAGE_SEO;

/**
 * Client-side title fallback — server metadata from layout.tsx is preferred for SEO.
 */
export function usePageTitle(title: string, pageKey?: PageKey) {
  useEffect(() => {
    if (pageKey && PAGE_SEO[pageKey]) {
      document.title = PAGE_SEO[pageKey].title.includes(SITE_NAME)
        ? PAGE_SEO[pageKey].title
        : `${PAGE_SEO[pageKey].title} | ${SITE_NAME}`;
      return;
    }
    document.title = title
      ? `${title} | ${SITE_NAME}`
      : PAGE_SEO.home.title;
  }, [title, pageKey]);
}
