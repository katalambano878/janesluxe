import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata('shop');

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
