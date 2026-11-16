'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch, cedis } from '@/lib/admin-fetch';

type Row = {
  id: string;
  name: string;
  sku: string | null;
  status: string;
  category: string | null;
  image: string | null;
  stock: number | null;
  regularPrice: number;
  sellingPrice: number;
  onPromotion: boolean;
  costPrice: number | null;
  supplierName: string | null;
  notes: string | null;
  costUpdatedAt: string | null;
  unitsSold30d: number;
};

type Draft = { cost: string; supplier: string; notes: string };
type Filter = 'all' | 'missing' | 'low';

const LOW_MARGIN = 25;

function margin(price: number, cost: number | null) {
  if (cost == null || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

function marginTone(m: number | null) {
  if (m == null) return 'text-gray-400';
  if (m < 0) return 'text-red-600';
  if (m < LOW_MARGIN) return 'text-amber-600';
  return 'text-green-700';
}

export default function ProfitPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ cost: '', supplier: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ products: Row[] }>('/api/admin/profit');
      setRows(data.products);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const costed = rows.filter((r) => r.costPrice != null);
    const stockValueCost = costed.reduce((s, r) => s + (r.costPrice || 0) * Math.max(0, r.stock || 0), 0);
    const stockValueRetail = costed.reduce((s, r) => s + r.sellingPrice * Math.max(0, r.stock || 0), 0);
    const margins = costed.map((r) => margin(r.sellingPrice, r.costPrice)).filter((m): m is number => m != null);
    return {
      costed: costed.length,
      missing: rows.length - costed.length,
      average: margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null,
      stockValueCost,
      stockProfit: stockValueRetail - stockValueCost,
    };
  }, [rows]);

  const visible = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.name} ${r.sku || ''} ${r.supplierName || ''} ${r.category || ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'missing') return r.costPrice == null;
    if (filter === 'low') {
      const m = margin(r.sellingPrice, r.costPrice);
      return m != null && m < LOW_MARGIN;
    }
    return true;
  });

  function startEdit(row: Row) {
    setEditing(row.id);
    setFlash('');
    setDraft({ cost: row.costPrice != null ? String(row.costPrice) : '', supplier: row.supplierName || '', notes: row.notes || '' });
  }

  async function save(row: Row) {
    setSaving(true);
    try {
      const result = await adminFetch<{ message: string }>('/api/admin/profit', {
        method: 'PUT',
        body: JSON.stringify({
          productId: row.id,
          costPrice: draft.cost.trim() === '' ? null : draft.cost,
          supplierName: draft.supplier,
          notes: draft.notes,
        }),
      });
      setFlash(result.message);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const draftCost = draft.cost.trim() === '' ? null : Number(draft.cost);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Profit margins</h1>
        <p className="text-gray-600 mt-1">
          Enter what each item cost from the supplier. Only admins see this page. Customers and staff never see your costs.
        </p>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 text-red-800 text-sm border border-red-100">{error}</div>}
      {flash && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-100 text-green-800 text-sm flex items-center gap-2">
          <i className="ri-checkbox-circle-fill text-green-600" /> {flash}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-slate-700 p-5 text-white">
          <p className="text-sm text-slate-100">Average margin</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{totals.average == null ? '—' : `${totals.average.toFixed(1)}%`}</p>
          <p className="mt-1 text-xs text-slate-200">Across {totals.costed} costed product{totals.costed === 1 ? '' : 's'}</p>
        </div>
        <Stat label="Stock at cost" value={cedis(totals.stockValueCost)} hint="What the stock on hand cost you" />
        <Stat label="Profit in stock" value={cedis(totals.stockProfit)} hint="If everything on hand sells at today’s price" />
        <Stat label="Missing a cost" value={String(totals.missing)} hint="Products without a supplier price" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, SKU or supplier"
            className="input pl-9"
          />
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {([
            ['all', 'All'],
            ['missing', 'No cost yet'],
            ['low', `Under ${LOW_MARGIN}%`],
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === key ? 'bg-slate-700 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <p className="p-12 text-center text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-12 text-center text-gray-500">No products match.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((row) => {
              const sellingMargin = margin(row.sellingPrice, row.costPrice);
              const regularMargin = margin(row.regularPrice, row.costPrice);
              const isEditing = editing === row.id;
              const previewMargin = isEditing ? margin(row.sellingPrice, draftCost) : null;
              return (
                <li key={row.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-3 lg:w-80 min-w-0">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {row.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.image} alt="" className="h-full w-full object-cover object-top" />
                        ) : (
                          <i className="ri-image-line flex h-full items-center justify-center text-gray-300 text-xl" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{row.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {[row.sku, row.category, `${row.stock ?? 0} in stock`, `${row.unitsSold30d} sold in 30 days`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>

                    <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                      <div>
                        <dt className="text-xs text-gray-500">Supplier cost</dt>
                        <dd className="font-semibold text-gray-900 tabular-nums">{row.costPrice == null ? '—' : cedis(row.costPrice)}</dd>
                        {row.supplierName && <dd className="text-xs text-gray-500 truncate">{row.supplierName}</dd>}
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">{row.onPromotion ? 'Selling now' : 'Selling price'}</dt>
                        <dd className="font-semibold text-gray-900 tabular-nums">{cedis(row.sellingPrice)}</dd>
                        {row.onPromotion && <dd className="text-xs text-gray-500 line-through tabular-nums">{cedis(row.regularPrice)}</dd>}
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Profit per item</dt>
                        <dd className={`font-semibold tabular-nums ${marginTone(sellingMargin)}`}>
                          {row.costPrice == null ? '—' : cedis(row.sellingPrice - row.costPrice)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Margin</dt>
                        <dd className={`text-lg font-bold tabular-nums ${marginTone(sellingMargin)}`}>
                          {sellingMargin == null ? '—' : `${sellingMargin.toFixed(1)}%`}
                        </dd>
                        {row.onPromotion && regularMargin != null && (
                          <dd className="text-xs text-gray-500">{regularMargin.toFixed(1)}% at full price</dd>
                        )}
                      </div>
                    </dl>

                    {!isEditing && (
                      <button
                        onClick={() => startEdit(row)}
                        className={`self-start lg:self-center rounded-lg px-4 py-2 text-sm font-semibold ${row.costPrice == null ? 'bg-slate-700 text-white hover:bg-slate-800' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {row.costPrice == null ? 'Add cost' : 'Edit'}
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(row);
                      }}
                      className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end"
                    >
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-700">Supplier cost (GH₵)</span>
                        <input
                          autoFocus
                          inputMode="decimal"
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.cost}
                          onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                          className="input bg-white"
                          placeholder="0.00"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-700">Supplier (optional)</span>
                        <input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} className="input bg-white" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-700">Notes (optional)</span>
                        <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="input bg-white" placeholder="e.g. bought in packs of 6" />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-white">
                          Cancel
                        </button>
                        <button disabled={saving} className="rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                      {previewMargin != null && (
                        <p className={`sm:col-span-4 text-sm font-medium ${marginTone(previewMargin)}`}>
                          At {cedis(row.sellingPrice)} you make {cedis(row.sellingPrice - (draftCost || 0))} per item, a {previewMargin.toFixed(1)}% margin.
                          {draftCost != null && draftCost > 0 && ` Mark-up is ${(((row.sellingPrice - draftCost) / draftCost) * 100).toFixed(0)}%.`}
                        </p>
                      )}
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}
