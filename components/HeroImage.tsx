'use client';

import { useState } from 'react';
import Image from 'next/image';

type HeroImageProps = {
  src: string;
  alt: string;
  position?: string;
  priority?: boolean;
};

/** Loads hero image from /public; falls back to brand gradient if file is missing. */
export default function HeroImage({
  src,
  alt,
  position = '50% 50%',
  priority = false,
}: HeroImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="absolute inset-0 bg-gradient-to-br from-brand-primary via-brand-secondary to-brand-ivory"
        aria-hidden
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      unoptimized
      sizes="100vw"
      className="object-cover"
      style={{
        objectPosition: position,
        filter: 'contrast(1.05) saturate(1.08)',
      }}
      onError={() => setFailed(true)}
    />
  );
}
