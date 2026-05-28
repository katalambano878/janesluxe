import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata('wishlist');

export default function WishlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
