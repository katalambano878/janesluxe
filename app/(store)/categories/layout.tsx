import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata('categories');

export default function CategoriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
