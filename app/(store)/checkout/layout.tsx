import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata('checkout', { noindex: true });

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
