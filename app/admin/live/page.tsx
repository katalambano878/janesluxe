'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, cedis } from '@/lib/admin-fetch';

type Session = {
  id: string;
  page: string;
  stage: string;
  cartItems: number;
  cartValue: number;
  lastSeen: string;
};

type LiveData = {
  windowSeconds: number;
  online: number;
  withBag: number;
  atCheckout: number;
  bagValue: number;
  today: { visitors: number; webOrders: number; webRevenue: number };
  sessions: Session[];
};

const REFRESH_MS = 15_000;

const STAGES: Record<string, { label: string; className: string; icon: string }> = {
  checkout: { label: 'At checkout', className: 'bg-slate-700 text-white', icon: 'ri-secure-payment-line' },
  cart: { label: 'Looking at bag', className: 'bg-slate-100 text-slate-800', icon: 'ri-shopping-bag-3-line' },
  has_bag: { label: 'Shopping with items', className: 'bg-slate-50 text-slate-700', icon: 'ri-shopping-bag-line' },
  viewing_product: { label: 'Viewing a product', className: 'bg-gray-100 text-gray-700', icon: 'ri-eye-line' },
  browsing: { label: 'Browsing', className: 'bg-gray-100 text-gray-600', icon: 'ri-compass-3-line' },
};

function pageName(path: string): string {
  if (path === '/') return 'Home';
  if (path.startsWith('/product/')) return `Product · ${decodeURIComponent(path.split('/')[2] || '').replace(/-/g, ' ')}`;
  const first = path.split('/')[1] || '';
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
}

function secondsAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 5 ? 'just now' : `${s}s ago`;
}

export default function LiveShoppersPage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminFetch<LiveData>('/api/live'));
      setUpdatedAt(new Date());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load live shoppers.');
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const stats = [
    { label: 'On the website now', value: data?.online ?? '—', icon: 'ri-user-line', hint: `Active in the last ${data?.windowSeconds ?? 90} seconds` },
    { label: 'With items in their bag', value: data?.withBag ?? '—', icon: 'ri-shopping-bag-3-line', hint: data ? `${cedis(data.bagValue)} in open bags` : '' },
    { label: 'At checkout', value: data?.atCheckout ?? '—', icon: 'ri-secure-payment-line', hint: 'Paying right now' },
    { label: 'Website orders today', value: data?.today.webOrders ?? '—', icon: 'ri-checkbox-circle-line', hint: data ? `${cedis(data.today.webRevenue)} · ${data.today.visitors} visitors today` : '' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            Live shoppers
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-500 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-slate-700" />
            </span>
          </h1>
          <p className="text-gray-600 mt-1">People on the Jane's Luxe website right now and what they are doing. Updates every 15 seconds.</p>
        </div>
        <p className="text-sm text-gray-500">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-GB')}` : 'Loading…'}
        </p>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 text-red-800 text-sm border border-red-100">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`rounded-2xl border p-5 ${i === 0 ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-gray-200'}`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-sm font-medium ${i === 0 ? 'text-slate-100' : 'text-gray-600'}`}>{stat.label}</p>
              <i className={`${stat.icon} text-xl ${i === 0 ? 'text-slate-200' : 'text-slate-700'}`} />
            </div>
            <p className="mt-3 text-4xl font-bold tabular-nums">{stat.value}</p>
            <p className={`mt-1 text-xs ${i === 0 ? 'text-slate-200' : 'text-gray-500'}`}>{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Who is online</h2>
          <button onClick={load} className="text-sm font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1">
            <i className="ri-refresh-line" /> Refresh
          </button>
        </div>
        {!data ? (
          <p className="p-8 text-center text-gray-500">Loading…</p>
        ) : data.sessions.length === 0 ? (
          <div className="p-12 text-center">
            <i className="ri-moon-line text-4xl text-gray-300" />
            <p className="mt-3 font-medium text-gray-700">Nobody is on the website right now</p>
            <p className="text-sm text-gray-500">Shoppers appear here within 30 seconds of opening the site.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.sessions.map((s) => {
              const stage = STAGES[s.stage] || STAGES.browsing;
              return (
                <li key={s.id + s.lastSeen} className="px-6 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-700">
                      <i className="ri-user-3-line" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate capitalize">{pageName(s.page)}</p>
                      <p className="text-xs text-gray-500">Shopper …{s.id} · {secondsAgo(s.lastSeen)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    {s.cartItems > 0 && (
                      <span className="text-sm text-gray-700 tabular-nums">
                        {s.cartItems} item{s.cartItems === 1 ? '' : 's'} · {cedis(s.cartValue)}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${stage.className}`}>
                      <i className={stage.icon} /> {stage.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
