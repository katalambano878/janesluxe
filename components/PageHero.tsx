import React from 'react';
import Image from 'next/image';

interface PageHeroProps {
  title: string;
  subtitle?: string;
  image?: string;
}

export default function PageHero({ title, subtitle, image }: PageHeroProps) {
  const hasImage = Boolean(image);

  return (
    <div className="relative overflow-hidden bg-brand-primary">
      {hasImage ? (
        <>
          <Image
            src={image!}
            alt={title}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/10" />
        </>
      ) : (
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary via-brand-secondary to-brand-ivory" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(201,163,107,0.15),transparent_45%),radial-gradient(circle_at_80%_15%,rgba(196,135,123,0.12),transparent_40%)]" />
        </div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h1 className={`text-4xl md:text-6xl font-bold mb-6 animate-in slide-in-from-bottom-4 duration-700 ${hasImage ? 'text-white drop-shadow-sm' : 'text-brand-text'}`}>
          {title}
        </h1>
        {subtitle && (
          <p className={`text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed animate-in slide-in-from-bottom-5 duration-700 delay-100 ${hasImage ? 'text-white/90' : 'text-brand-text/75'}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
