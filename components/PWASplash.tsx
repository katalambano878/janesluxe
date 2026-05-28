'use client';

import { useState, useEffect } from 'react';
import { LOGO_PATH, SITE_NAME } from '@/lib/site-config';

export default function PWASplash() {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

      const hasShownSplash = sessionStorage.getItem('splashShown');

      if (isStandalone && !hasShownSplash) {
        setShowSplash(true);
        sessionStorage.setItem('splashShown', 'true');

        const timer = setTimeout(() => setShowSplash(false), 2000);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore storage / media query errors in restricted contexts
    }
  }, []);

  if (!showSplash) return null;

  return (
    <div className="pwa-splash" aria-hidden="true">
      <div className="pwa-splash-logo mb-6">
        <img
          src={LOGO_PATH}
          alt={SITE_NAME}
          className="h-24 w-auto max-w-[200px] object-contain mx-auto"
        />
      </div>
      <h1 className="text-white text-xl font-bold mb-2">{SITE_NAME}</h1>
      <p className="text-brand-champagne text-sm font-medium mb-8">Style That Feels Like You</p>
      <div className="pwa-splash-dots flex gap-1.5">
        <span className="w-2 h-2 bg-white rounded-full" />
        <span className="w-2 h-2 bg-white rounded-full" />
        <span className="w-2 h-2 bg-white rounded-full" />
      </div>
    </div>
  );
}
