'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch, cedis } from '@/lib/admin-fetch';

type Report = {
  day: string;
  summary: {
    paidOrders: number;
    unpaidOrders: number;
    cancelledOrders: number;
    posOrders: number;
    webOrders: number;
    revenue: number;
    posRevenue: number;
    webRevenue: number;
    discounts: number;
    toFulfil: number;
    unitsSold: number;
    averageOrder: number;
    profit: number | null;
    profitCoverage: number;
  };
  comparison: { yesterday: number; lastWeek: number };
  payments: { method: string; channel: string; orders: number; revenue: number }[];
  items: { productId: string | null; name: string; units: number; posUnits: number; webUnits: number; revenue: number; stockLeft: number | null; profit: number | null }[];
  lowStock: { name: string; stockLeft: number | null }[];
  staff: { name: string; orders: number; revenue: number; units: number }[];
  orders: { id: string; order_number: string; total: number; payment_status: string; payment_method: string | null; status: string; created_at: string; staff_name: string | null; channel: string; customer: string }[];
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  momo: 'Mobile Money',
  moolre: 'Mobile Money',
  hubtel: 'Hubtel (MoMo / card)',
  other: 'Other',
};

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

function change(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

export default function EndOfDayPage() {
  const [date, setDate] = useState(today());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (day: string) => {
    setLoading(true);
    setError('');
    try {
      setReport(await adminFetch<Report>(`/api/admin/end-of-day?date=${day}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const s = report?.summary;
  const vsYesterday = s && report ? change(s.revenue, report.comparison.yesterday) : null;
  const webShare = s && s.revenue ? Math.round((s.webRevenue / s.revenue) * 100) : 0;
  const prettyDay = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">End of Day</h1>
          <p className="text-gray-600 mt-1">{prettyDay} · sales, stock movement, website vs POS</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-slate-600 focus:ring-slate-600"
          />
          <button
            onClick={() => setDate(today())}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 flex items-center gap-2"
          >
            <i className="ri-printer-line" /> Print close
          </button>
        </div>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 text-red-800 text-sm border border-red-100">{error}</div>}

      {loading && !report ? (
        <div className="flex items-center justify-center min-h-[30vh] text-gray-500">
          <i className="ri-loader-4-line text-3xl animate-spin mr-2" /> Loading…
        </div>
      ) : s && report ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="col-span-2 rounded-2xl bg-slate-700 p-6 text-white">
              <p className="text-sm text-slate-100">Paid sales</p>
              <p className="mt-2 text-4xl font-bold tabular-nums">{cedis(s.revenue)}</p>
              <p className="mt-2 text-sm text-slate-100">
                {s.paidOrders} paid order{s.paidOrders === 1 ? '' : 's'} · {s.unitsSold} item{s.unitsSold === 1 ? '' : 's'} sold
                {vsYesterday != null && (
                  <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">
                    {vsYesterday >= 0 ? '+' : ''}
                    {vsYesterday}% vs yesterday
                  </span>
                )}
              </p>
            </div>
            <Stat label="Average order" value={cedis(s.averageOrder)} />
            <Stat
              label="Profit (where cost is known)"
              value={s.profit == null ? '—' : cedis(s.profit)}
              hint={
                s.profit == null
                  ? 'Add supplier costs on Profit margins'
                  : `${Math.round(s.profitCoverage * 100)}% of items have a cost`
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 lg:col-span-2">
              <h2 className="font-semibold text-gray-900">Website vs POS</h2>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div className="h-full bg-slate-700" style={{ width: `${webShare}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Channel label="Website" icon="ri-global-line" revenue={s.webRevenue} orders={s.webOrders} tone="dark" />
                <Channel label="POS (in store)" icon="ri-store-3-line" revenue={s.posRevenue} orders={s.posOrders} tone="light" />
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="font-semibold text-gray-900">Still to do</h2>
              <ul className="mt-4 space-y-3 text-sm">
                <Todo label="Paid, not yet sent out" value={s.toFulfil} href="/admin/orders" />
                <Todo label="Waiting for payment" value={s.unpaidOrders} href="/admin/orders" />
                <Todo label="Cancelled" value={s.cancelledOrders} />
                <Todo label="Discounts given" value={cedis(s.discounts)} />
              </ul>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Sales by staff (POS)" empty="No POS sales on this day.">
              {report.staff.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr><th className="py-2 font-medium">Sold by</th><th className="py-2 font-medium text-right">Orders</th><th className="py-2 font-medium text-right">Items</th><th className="py-2 font-medium text-right">Sales</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.staff.map((row) => (
                      <tr key={row.name}>
                        <td className="py-2.5 font-medium text-gray-900 flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-800">
                            {row.name.charAt(0).toUpperCase()}
                          </span>
                          {row.name}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{row.orders}</td>
                        <td className="py-2.5 text-right tabular-nums">{row.units}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{cedis(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="How customers paid" empty="No payments on this day.">
              {report.payments.length > 0 && (
                <ul className="divide-y divide-gray-100 text-sm">
                  {report.payments.map((p) => (
                    <li key={p.method + p.channel} className="flex items-center justify-between py-2.5">
                      <span className="text-gray-800">
                        {METHOD_LABELS[p.method] || p.method}
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{p.channel}</span>
                      </span>
                      <span className="tabular-nums">
                        <span className="text-gray-500 mr-3">{p.orders}×</span>
                        <span className="font-semibold">{cedis(p.revenue)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Stock movement" empty="Nothing sold on this day.">
            {report.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 font-medium">Product</th>
                      <th className="py-2 font-medium text-right">Website</th>
                      <th className="py-2 font-medium text-right">POS</th>
                      <th className="py-2 font-medium text-right">Total out</th>
                      <th className="py-2 font-medium text-right">Stock left</th>
                      <th className="py-2 font-medium text-right">Sales</th>
                      {s.profit != null && <th className="py-2 font-medium text-right">Profit</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.items.map((item) => (
                      <tr key={(item.productId || '') + item.name}>
                        <td className="py-2.5 font-medium text-gray-900">{item.name}</td>
                        <td className="py-2.5 text-right tabular-nums">{item.webUnits}</td>
                        <td className="py-2.5 text-right tabular-nums">{item.posUnits}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">−{item.units}</td>
                        <td className={`py-2.5 text-right tabular-nums ${item.stockLeft != null && item.stockLeft <= 5 ? 'text-red-600 font-semibold' : ''}`}>
                          {item.stockLeft ?? '—'}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{cedis(item.revenue)}</td>
                        {s.profit != null && (
                          <td className="py-2.5 text-right tabular-nums">{item.profit == null ? '—' : cedis(item.profit)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report.lowStock.length > 0 && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <i className="ri-alarm-warning-line mr-1" />
                Running low after today: {report.lowStock.map((i) => `${i.name} (${i.stockLeft})`).join(', ')}
              </p>
            )}
          </Card>

          <Card title={`All orders (${report.orders.length})`} empty="No orders on this day.">
            {report.orders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 font-medium">Time</th>
                      <th className="py-2 font-medium">Order</th>
                      <th className="py-2 font-medium">Customer</th>
                      <th className="py-2 font-medium">Channel</th>
                      <th className="py-2 font-medium">Sold by</th>
                      <th className="py-2 font-medium">Payment</th>
                      <th className="py-2 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2.5 tabular-nums text-gray-600">
                          {new Date(o.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })}
                        </td>
                        <td className="py-2.5">
                          <Link href={`/admin/orders/${o.id}`} className="font-medium text-slate-700 hover:underline print:no-underline">
                            {o.order_number}
                          </Link>
                        </td>
                        <td className="py-2.5 text-gray-800">{o.customer || 'Walk-in'}</td>
                        <td className="py-2.5">{o.channel}</td>
                        <td className="py-2.5 text-gray-800">{o.staff_name || (o.channel === 'POS' ? 'Unassigned' : '—')}</td>
                        <td className="py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.payment_status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {o.payment_status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{cedis(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Channel({ label, icon, revenue, orders, tone }: { label: string; icon: string; revenue: number; orders: number; tone: 'dark' | 'light' }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone === 'dark' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-800'}`}>
        <i className={icon} />
      </span>
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="font-bold text-gray-900 tabular-nums">{cedis(revenue)}</p>
        <p className="text-xs text-gray-500">{orders} paid order{orders === 1 ? '' : 's'}</p>
      </div>
    </div>
  );
}

function Todo({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <span className="flex items-center justify-between">
      <span className="text-gray-700">{label}</span>
      <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
    </span>
  );
  return <li>{href ? <Link href={href} className="block hover:text-slate-700">{content}</Link> : content}</li>;
}

function Card({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 break-inside-avoid">
      <h2 className="font-semibold text-gray-900 mb-3">{title}</h2>
      {hasContent ? children : <p className="py-6 text-center text-sm text-gray-500">{empty}</p>}
    </div>
  );
}
