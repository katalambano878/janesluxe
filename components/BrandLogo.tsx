'use client';

import Image from 'next/image';
import Link from 'next/link';
import { LOGO_PATH, SITE_NAME } from '@/lib/site-config';

type BrandLogoProps = {
  className?: string;
  height?: number;
  /** Set to `false` to render image only (no link). Default: `/` */
  href?: string | false;
  priority?: boolean;
};

/** Jane's Luxe brand mark — uses /public/logo.png */
export default function BrandLogo({
  className = 'h-10 w-auto object-contain',
  height = 40,
  href = '/',
  priority = false,
}: BrandLogoProps) {
  const img = (
    <Image
      src={LOGO_PATH}
      alt={SITE_NAME}
      width={height * 3}
      height={height}
      className={className}
      style={{ width: 'auto', height }}
      priority={priority}
      unoptimized
    />
  );

  if (href === false) return img;

  return (
    <Link href={href} className="inline-flex items-center" aria-label={`${SITE_NAME} home`}>
      {img}
    </Link>
  );
}
