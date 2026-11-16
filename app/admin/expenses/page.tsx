'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, cedis } from '@/lib/admin-fetch';

type Expense = {
  id: string;
  staff_name: string | null;
  staff_email: string | null;
  amount: number;
  description: string;
  spent_on: string;
  created_at: string;
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await adminFetch<{ expenses: Expense[]; canSeeAll: boolean }>('/api/admin/expenses');
    setExpenses(data.expenses || []);
    setCanSeeAll(Boolean(data.canSeeAll));
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load expenses.'));
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminFetch('/api/admin/expenses', {
        method: 'POST',
        body: JSON.stringify({ description, amount, spentOn }),
      });
      setDescription('');
      setAmount('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const total = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
        <p className="text-gray-600 mt-1">
          Staff write what money was used for. The admin sees every entry.
        </p>
      </div>

      <form onSubmit={save} className="bg-white border border-gray-200 rounded-xl p-5 grid gap-4 sm:grid-cols-[1fr_140px_160px_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">What it was used for</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={400}
            placeholder="Transport, packaging, airtime…"
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">Amount (₵)</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-gray-700">Date</span>
          <input
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Record'}
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{canSeeAll ? 'All staff expenses' : 'Your expenses'}</h2>
          <p className="text-sm font-semibold text-gray-900">{cedis(total)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">What it was for</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-gray-500">No expenses recorded yet.</td>
                </tr>
              ) : (
                expenses.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-5 py-3 whitespace-nowrap">{new Date(row.spent_on).toLocaleDateString('en-GB')}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.staff_name || 'Staff'}</p>
                      <p className="text-xs text-gray-500">{row.staff_email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-800">{row.description}</td>
                    <td className="px-5 py-3 text-right font-semibold">{cedis(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
