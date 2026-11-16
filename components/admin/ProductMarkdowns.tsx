'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, cedis } from '@/lib/admin-fetch';

type Markdown = { original_price: number; type: 'percent' | 'fixed'; value: number; applied_at: string; applied_by: string };
type Product = {
  id: string;
  name: string;
  sku: string | null;
  status: string;
  price: number;
  compare_at_price: number | null;
  category_id: string | null;
  category: string | null;
  markdown: Markdown | null;
  variant_count: number;
  image: string | null;
};
type Category = { id: string; name: string };

function previewPrice(base: number, type: 'percent' | 'fixed', value: number) {
  const next = type === 'percent' ? base * (1 - value / 100) : base - value;
  return Math.round(next * 100) / 100;
}

export default function ProductMarkdowns() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saleRunning, setSaleRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('10');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ products: Product[]; categories: Category[]; storeSaleRunning: boolean }>('/api/admin/discounts');
      setProducts(data.products);
      setCategories(data.categories);
      setSaleRunning(data.storeSaleRunning);
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not load products.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const marked = products.filter((p) => p.markdown);
  const amount = Number(value) || 0;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) => (!category || p.category_id === category) && (!q || `${p.name} ${p.sku || ''}`.toLowerCase().includes(q))
    );
  }, [products, category, search]);
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of visible) {
        if (allVisibleSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  async function run(method: 'POST' | 'DELETE', body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await adminFetch<{ message: string }>('/api/admin/discounts', { method, body: JSON.stringify(body) });
      setNotice({ kind: 'ok', text: result.message });
      setSelected(new Set());
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className={`p-4 rounded-lg text-sm border ${notice.kind === 'ok' ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
          {notice.text}
        </div>
      )}

      {saleRunning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
          <i className="ri-error-warning-line text-lg" />
          <p>
            <strong>A whole-store sale is on.</strong> Turn it off before marking down products, so customers are not discounted twice.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-24 self-start">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">New markdown</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['percent', '% off'],
                ['fixed', 'GH₵ off'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`rounded-lg border py-2 text-sm font-semibold ${type === key ? 'border-slate-700 bg-slate-700 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">{type === 'percent' ? 'Percentage' : 'Amount in cedis'}</span>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step={type === 'percent' ? '1' : '0.5'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="input pr-12 text-lg font-semibold"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{type === 'percent' ? '%' : 'GH₵'}</span>
              </div>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(type === 'percent' ? [10, 15, 20, 25, 30, 50] : [10, 20, 50, 100]).map((n) => (
                <button
                  key={n}
                  onClick={() => setValue(String(n))}
                  className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  {type === 'percent' ? `${n}%` : `GH₵${n}`}
                </button>
              ))}
            </div>
            <button
              disabled={busy || saleRunning || selected.size === 0 || amount <= 0}
              onClick={() => run('POST', { productIds: [...selected], type, value: amount })}
              className="w-full rounded-lg bg-slate-700 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? 'Working…' : selected.size ? `Mark down ${selected.size} product${selected.size === 1 ? '' : 's'}` : 'Choose products'}
            </button>
            <p className="text-xs text-gray-500">Re-applying a markdown starts from the original price, so discounts never stack.</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">Marked down now</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{marked.length}</p>
            {marked.length > 0 && (
              <button
                disabled={busy}
                onClick={() => run('DELETE', { all: true })}
                className="mt-3 w-full rounded-lg border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                End all markdowns
              </button>
            )}
          </div>
        </aside>

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} className="h-4 w-4 rounded border-gray-300 text-slate-700 focus:ring-slate-600" />
              Select all shown
            </label>
            <div className="flex flex-1 gap-2 sm:justify-end">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="input sm:w-48" />
            </div>
          </div>

          {loading ? (
            <p className="p-12 text-center text-gray-500">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="p-12 text-center text-gray-500">No products match.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {visible.map((p) => {
                const base = p.markdown?.original_price ?? p.price;
                const preview = selected.has(p.id) && amount > 0 ? previewPrice(base, type, amount) : null;
                return (
                  <li key={p.id} className={`flex items-center gap-4 px-4 py-3 ${selected.has(p.id) ? 'bg-slate-50/60' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.name}`}
                      className="h-4 w-4 rounded border-gray-300 text-slate-700 focus:ring-slate-600"
                    />
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                      {p.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-full w-full object-cover object-top" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[p.category, p.variant_count ? `${p.variant_count} options` : null, p.status !== 'active' ? p.status : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      {p.markdown ? (
                        <>
                          <p className="font-semibold text-gray-900">{cedis(p.price)}</p>
                          <p className="text-xs text-gray-500 line-through">{cedis(p.markdown.original_price)}</p>
                        </>
                      ) : (
                        <p className="font-semibold text-gray-900">{cedis(p.price)}</p>
                      )}
                      {preview != null && (
                        <p className={`text-xs font-semibold ${preview > 0 ? 'text-slate-700' : 'text-red-600'}`}>
                          → {preview > 0 ? cedis(preview) : 'too low'}
                        </p>
                      )}
                    </div>
                    <div className="w-28 shrink-0 text-right">
                      {p.markdown ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                            {p.markdown.type === 'percent' ? `${p.markdown.value}% off` : `GH₵${p.markdown.value} off`}
                          </span>
                          <button
                            disabled={busy}
                            onClick={() => run('DELETE', { productIds: [p.id] })}
                            className="text-xs font-medium text-gray-500 hover:text-slate-700"
                          >
                            End
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Full price</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}