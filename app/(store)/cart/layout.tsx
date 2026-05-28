import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata('cart', { noindex: true });

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
