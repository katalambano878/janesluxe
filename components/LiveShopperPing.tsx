'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';

const PING_EVERY_MS = 30_000;

function visitorId(): string {
  const key = '_jl_id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return '';
  }
}

export default function LiveShopperPing() {
  const pathname = usePathname() || '/';
  const { cartCount, subtotal } = useCart();
  const latest = useRef({ pathname, cartCount, subtotal });
  latest.current = { pathname, cartCount, subtotal };

  useEffect(() => {
    const id = visitorId();
    if (!id) return;

    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      const { pathname: page, cartCount: items, subtotal: value } = latest.current;
      fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: id, page, cartItems: items, cartValue: value }),
        keepalive: true,
      }).catch(() => {});
    };

    ping();
    const timer = window.setInterval(ping, PING_EVERY_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [pathname, cartCount]);

  return null;
}