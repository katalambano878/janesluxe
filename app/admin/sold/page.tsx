'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { formatPrice } from '@/lib/format-price';
import { downloadCsv, todayStamp } from '@/lib/csv';

type SoldProduct = {
  key: string;
  productId: string | null;
  name: string;
  sku: string | null;
  category: string | null;
  unitsSold: number;
  orders: number;
  revenue: number;
};

type ClosedPeriod = { id: string; start: string | null; end: string; revenue: number; orders: number; itemsSold: number };

type SoldReport = {
  selected: string;
  range: { from: string | null; to: string | null };
  totals: { revenue: number; orders: number; itemsSold: number; itemsRevenue: number };
  products: SoldProduct[];
  currentStart: string | null;
  history: ClosedPeriod[];
};

type SortKey = 'name' | 'unitsSold' | 'orders' | 'revenue';

const money = (n: number) => formatPrice(n, { decimals: true });

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function periodRange(start: string | null, end: string) {
  return `${start ? shortDate(start) : 'Store opening'} to ${shortDate(end)}`;
}

export default function ProductsSoldPage() {
  const [period, setPeriod] = useState('current');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [ready, setReady] = useState(false);
  const [report, setReport] = useState<SoldReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDown, setSortDown] = useState(true);

  // A link from the dashboard can open a past period directly: /admin/sold?period=<id>
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('period');
    if (wanted) setPeriod(wanted);
    setReady(true);
  }, []);

  const waitingForDates = period === 'custom' && !fromDay && !toDay;

  const load = useCallback(async () => {
    if (waitingForDates) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (period === 'custom') {
        if (fromDay) query.set('from', fromDay);
        if (toDay) query.set('to', toDay);
      } else {
        query.set('period', period);
      }
      setReport(await adminFetch<SoldReport>(`/api/admin/sold?${query.toString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The report could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [period, fromDay, toDay, waitingForDates]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (report?.products || []).filter(
      (p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.sku || '').toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term)
    );
    const direction = sortDown ? -1 : 1;
    return [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * (sortDown ? 1 : -1);
      return (a[sortKey] - b[sortKey]) * direction || a.name.localeCompare(b.name);
    });
  }, [report, search, sortKey, sortDown]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortDown((down) => !down);
    else {
      setSortKey(key);
      setSortDown(true);
    }
  };

  const totals = report?.totals;
  // Order totals can differ from the product lines by delivery fees, discounts or an edited order.
  const adjustment = totals ? Math.round((totals.revenue - totals.itemsRevenue) * 100) / 100 : 0;
  const filtering = search.trim().length > 0;
  const shownUnits = rows.reduce((sum, p) => sum + p.unitsSold, 0);
  const shownRevenue = rows.reduce((sum, p) => sum + p.revenue, 0);

  const periodLabel = (() => {
    if (period === 'all') return 'All time';
    if (period === 'custom') {
      if (fromDay && toDay) return `${shortDate(fromDay)} to ${shortDate(toDay)}`;
      if (fromDay) return `From ${shortDate(fromDay)}`;
      if (toDay) return `Up to ${shortDate(toDay)}`;
      return 'Chosen dates';
    }
    if (period === 'current') {
      return report?.currentStart ? `Since ${shortDate(report.currentStart)}` : 'Since the store opened';
    }
    const closed = report?.history.find((p) => p.id === period);
    return closed ? periodRange(closed.start, closed.end) : 'Past stock period';
  })();

  const exportCsv = () => {
    if (!report || !totals) return;
    const lines: unknown[][] = [
      ['Products sold', periodLabel],
      [],
      ['Product', 'SKU', 'Category', 'Units sold', 'Orders', 'Revenue'],
      ...rows.map((p) => [p.name, p.sku || '', p.category || '', p.unitsSold, p.orders, p.revenue.toFixed(2)]),
      [],
    ];
    if (filtering) {
      lines.push(['Products shown', '', '', shownUnits, '', shownRevenue.toFixed(2)]);
    }
    lines.push(['All products', '', '', totals.itemsSold, '', totals.itemsRevenue.toFixed(2)]);
    if (adjustment !== 0) lines.push(['Delivery fees, discounts and edited orders', '', '', '', '', adjustment.toFixed(2)]);
    lines.push(['Revenue', '', '', '', totals.orders, totals.revenue.toFixed(2)]);
    const slug = periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadCsv(`products-sold-${slug}-${todayStamp()}.csv`, lines);
  };

  const sortHeader = (label: string, column: SortKey, align: 'left' | 'right' = 'right') => {
    const active = sortKey === column;
    const descending = column === 'name' ? !sortDown : sortDown;
    return (
      <th
        key={column}
        scope="col"
        aria-sort={active ? (descending ? 'descending' : 'ascending') : 'none'}
        className={`px-6 py-3 text-sm font-semibold text-gray-900 ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <button
          type="button"
          onClick={() => sortBy(column)}
          className={`inline-flex items-center gap-1 rounded cursor-pointer hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          {label}
          <i
            aria-hidden
            className={`text-base ${active ? 'text-slate-900' : 'text-gray-300'} ${
              active ? (descending ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line') : 'ri-expand-up-down-line'
            }`}
          />
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products sold</h1>
          <p className="text-gray-600 mt-1 max-w-2xl">
            Everything sold, product by product. The revenue at the bottom is the same figure the dashboard shows.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={loading || !report || report.products.length === 0}
          title={report && report.products.length === 0 ? 'Nothing to export' : 'Download this list as a spreadsheet'}
          className="border-2 border-gray-300 hover:border-gray-400 disabled:opacity-60 text-gray-700 px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 whitespace-nowrap cursor-pointer"
        >
          <i className="ri-download-line" aria-hidden></i>
          <span>Export</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex flex-col lg:flex-row lg:items-start gap-4">
          <label className="block lg:w-80">
            <span className="block text-sm font-medium text-gray-700 mb-1">Period</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-3 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-slate-700 cursor-pointer"
            >
              <option value="current">This stock period</option>
              {(report?.history || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {periodRange(p.start, p.end)}
                </option>
              ))}
              {/* Until the first stock take, the current period already covers everything. */}
              {(report?.currentStart || period === 'all') && <option value="all">All time</option>}
              <option value="custom">Choose dates</option>
            </select>
            <span className="block text-sm text-gray-600 mt-1">{periodLabel}</span>
          </label>

          {period === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-4">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">From</span>
                <input
                  type="date"
                  value={fromDay}
                  max={toDay || undefined}
                  onChange={(e) => setFromDay(e.target.value)}
                  className="px-3 py-3 border-2 border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-slate-700"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">To</span>
                <input
                  type="date"
                  value={toDay}
                  min={fromDay || undefined}
                  onChange={(e) => setToDay(e.target.value)}
                  className="px-3 py-3 border-2 border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-slate-700"
                />
              </label>
            </div>
          )}

          <label className="block lg:ml-auto lg:w-72">
            <span className="block text-sm font-medium text-gray-700 mb-1">Find a product</span>
            <span className="relative block">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden></i>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, SKU or category"
                className="w-full pl-10 pr-3 py-3 border-2 border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-slate-700"
              />
            </span>
          </label>
        </div>

        {waitingForDates ? (
          <p className="p-12 text-center text-gray-600">Choose a start date, an end date, or both.</p>
        ) : error ? (
          <div className="p-12 text-center" role="alert">
            <p className="text-gray-900 font-semibold">The report could not be loaded.</p>
            <p className="text-gray-600 mt-1">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 border-b border-gray-200">
              {[
                { label: 'Revenue', value: totals ? money(totals.revenue) : '' },
                { label: 'Paid orders', value: totals ? totals.orders.toLocaleString() : '' },
                { label: 'Items sold', value: totals ? totals.itemsSold.toLocaleString() : '' },
              ].map((figure) => (
                <div key={figure.label} className="px-6 py-4">
                  <dt className="text-sm text-gray-600">{figure.label}</dt>
                  <dd className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
                    {loading || !totals ? <span className="inline-block h-7 w-28 rounded bg-gray-100 animate-pulse align-middle" /> : figure.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Products sold, {periodLabel}</caption>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {sortHeader('Product', 'name', 'left')}
                    <th scope="col" className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Category</th>
                    {sortHeader('Units sold', 'unitsSold')}
                    {sortHeader('Orders', 'orders')}
                    {sortHeader('Revenue', 'revenue')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading ? (
                    Array.from({ length: 6 }, (_, i) => (
                      <tr key={i}>
                        {[56, 24, 12, 12, 20].map((w, j) => (
                          <td key={j} className="px-6 py-4">
                            <span className={`block h-4 rounded bg-gray-100 animate-pulse ${j > 1 ? 'ml-auto' : ''}`} style={{ width: `${w * 0.25}rem` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-600">
                        {filtering ? `No product sold in this period matches "${search.trim()}".` : 'Nothing was sold in this period.'}
                      </td>
                    </tr>
                  ) : (
                    rows.map((p) => (
                      <tr key={p.key} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          {p.sku && <p className="text-sm text-gray-500">{p.sku}</p>}
                        </td>
                        <td className="px-6 py-4 text-gray-700">{p.category || '-'}</td>
                        <td className="px-6 py-4 text-right tabular-nums font-semibold text-gray-900">{p.unitsSold.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-700">{p.orders.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right tabular-nums text-gray-900">{money(p.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!loading && totals && report && report.products.length > 0 && (
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                    {filtering && (
                      <tr>
                        <th scope="row" colSpan={2} className="px-6 py-3 text-left font-medium text-gray-700">
                          Products shown ({rows.length} of {report.products.length})
                        </th>
                        <td className="px-6 py-3 text-right tabular-nums text-gray-700">{shownUnits.toLocaleString()}</td>
                        <td />
                        <td className="px-6 py-3 text-right tabular-nums text-gray-700">{money(shownRevenue)}</td>
                      </tr>
                    )}
                    <tr>
                      <th scope="row" colSpan={2} className="px-6 py-3 text-left font-medium text-gray-700">
                        All products ({report.products.length})
                      </th>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-900">{totals.itemsSold.toLocaleString()}</td>
                      <td />
                      <td className="px-6 py-3 text-right tabular-nums text-gray-900">{money(totals.itemsRevenue)}</td>
                    </tr>
                    {adjustment !== 0 && (
                      <tr>
                        <th scope="row" colSpan={4} className="px-6 py-3 text-left font-medium text-gray-700">
                          Delivery fees, discounts and edited orders
                        </th>
                        <td className="px-6 py-3 text-right tabular-nums text-gray-900">{money(adjustment)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-gray-300">
                      <th scope="row" colSpan={3} className="px-6 py-4 text-left text-base font-bold text-gray-900">
                        Revenue
                      </th>
                      <td className="px-6 py-4 text-right tabular-nums text-gray-700">{totals.orders.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right tabular-nums text-base font-bold text-gray-900">{money(totals.revenue)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>

      <p className="text-sm text-gray-600">
        A sale counts once it is paid. Cancelled and refunded orders are left out.
      </p>
    </div>
  );
}
