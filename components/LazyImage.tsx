'use client';

import { useState } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  onLoad?: () => void;
  sizes?: string;
}

/**
 * Reliable product image loader.
 * Uses a plain <img> for absolute storage URLs so mobile browsers / PWAs
 * are not blocked by next/image optimizer quirks.
 */
export default function LazyImage({
  src,
  alt,
  className = '',
  width,
  height,
  priority = false,
  onLoad,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    onLoad?.();
  };

  const handleError = () => {
    // One automatic cache-bust retry (helps after SW / CDN stale misses)
    if (retryKey === 0 && src) {
      setRetryKey(1);
      setIsLoaded(false);
      return;
    }
    setHasError(true);
    setIsLoaded(true);
    onLoad?.();
  };

  if (!src || hasError) {
    return (
      <div
        className={`relative overflow-hidden bg-brand-cream/40 flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <span className="text-gray-400 text-xs">No Image</span>
      </div>
    );
  }

  const displaySrc =
    retryKey > 0
      ? `${src}${src.includes('?') ? '&' : '?'}_r=${retryKey}`
      : src;

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse z-10" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={retryKey}
        src={displaySrc}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}
