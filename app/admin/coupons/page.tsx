'use client';

import { useState, useEffect } from 'react';

export default function AdminCouponsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    type: 'percentage',
    value: '',
    minimum_purchase: '',
    usage_limit: '',
    end_date: '',
  });

  useEffect(() => {
    fetchCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/admin/coupons', { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to fetch coupons');

      const data = json.coupons || [];
      setCoupons(data.map((c: any) => ({
        id: c.id,
        code: c.code,
        type: formatCouponType(c.type || c.discount_type),
        value: c.value ?? c.discount_value ?? 0,
        minPurchase: c.minimum_purchase ?? c.min_purchase_amount ?? 0,
        usageLimit: c.usage_limit ?? null,
        usedCount: c.usage_count ?? c.times_used ?? 0,
        startDate: c.start_date ? new Date(c.start_date).toLocaleDateString() : 'N/A',
        endDate: c.end_date ? new Date(c.end_date).toLocaleDateString() : null,
        status: isCouponActive(c) ? 'Active' : 'Expired',
      })));
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Failed to load coupons');
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCouponType = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'percentage') return 'Percentage';
    if (t === 'fixed' || t === 'fixed_amount') return 'Fixed Amount';
    if (t === 'free_shipping') return 'Free Shipping';
    return type || 'Percentage';
  };

  const isCouponActive = (c: any) => {
    // Simple check
    if (!c.is_active) return false;
    if (c.end_date && new Date(c.end_date) < new Date()) return false;
    return true;
  };

  const statusColors: any = {
    'Active': 'bg-gray-100 text-gray-900',
    'Scheduled': 'bg-blue-100 text-blue-700',
    'Expired': 'bg-gray-100 text-gray-700',
    'Disabled': 'bg-red-100 text-red-700'
  };

  const openCreate = () => {
    setFormError(null);
    setForm({ code: '', type: 'percentage', value: '', minimum_purchase: '', usage_limit: '', end_date: '' });
    setEditingCoupon(null);
    setShowEditModal(false);
    setShowAddModal(true);
  };

  const handleEdit = (coupon: any) => {
    setFormError(null);
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code || '',
      type: (coupon.type || 'Percentage') === 'Fixed Amount' ? 'fixed_amount'
        : (coupon.type || '') === 'Free Shipping' ? 'free_shipping' : 'percentage',
      value: String(coupon.value ?? ''),
      minimum_purchase: String(coupon.minPurchase ?? ''),
      usage_limit: coupon.usageLimit != null ? String(coupon.usageLimit) : '',
      end_date: '',
    });
    setShowAddModal(false);
    setShowEditModal(true);
  };

  const handleSaveCoupon = async () => {
    try {
      setSaving(true);
      setFormError(null);
      const code = form.code.trim().toUpperCase();
      if (!code) throw new Error('Coupon code is required');
      if (form.type !== 'free_shipping' && !(Number(form.value) > 0)) {
        throw new Error('Discount value must be greater than 0');
      }

      const payload: Record<string, unknown> = {
        code,
        type: form.type,
        value: form.type === 'free_shipping' ? 0 : Number(form.value),
        minimum_purchase: Number(form.minimum_purchase) || 0,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        is_active: true,
      };

      const isEdit = showEditModal && editingCoupon?.id;
      const res = await fetch('/api/admin/coupons', {
        method: isEdit ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: editingCoupon.id, ...payload } : payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save coupon');

      setShowAddModal(false);
      setShowEditModal(false);
      setEditingCoupon(null);
      await fetchCoupons();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save coupon');
    } finally {
      setSaving(false);
    }
  };

  const activeCoupons = coupons.filter(c => c.status === 'Active');
  const totalUses = coupons.reduce((sum, c) => sum + c.usedCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Coupons & Promotions</h1>
          <p className="text-gray-600 mt-1">Create and manage discount codes</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line mr-2"></i>
          Create Coupon
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Coupons</p>
          <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Active</p>
          <p className="text-2xl font-bold text-gray-900">{activeCoupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Uses</p>
          <p className="text-2xl font-bold text-gray-900">{totalUses}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Discount</p>
          <p className="text-2xl font-bold text-purple-700">--</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">All Coupons</h2>
            <div className="flex items-center space-x-3">
              <select className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer">
                <option>All Status</option>
                <option>Active</option>
                <option>Scheduled</option>
                <option>Expired</option>
              </select>
              <select className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer">
                <option>Sort by Date</option>
                <option>Sort by Usage</option>
                <option>Sort by Value</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Code</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Type</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Value</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Min Purchase</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Usage</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Valid Period</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">Loading coupons...</td></tr>
              ) : loadError ? (
                <tr><td colSpan={8} className="p-8 text-center text-red-600">{loadError}</td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">No coupons found.</td></tr>
              ) : (
                coupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">{coupon.code}</span>
                        <button className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded transition-colors cursor-pointer">
                          <i className="ri-file-copy-line"></i>
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700">{coupon.type}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900">
                      {coupon.type === 'Percentage' ? `${coupon.value}%` : coupon.type === 'Fixed Amount' ? `GH₵ ${coupon.value}` : 'Free Shipping'}
                    </td>
                    <td className="py-4 px-4 text-gray-700 whitespace-nowrap">
                      {coupon.minPurchase > 0 ? `GH₵ ${coupon.minPurchase.toFixed(2)}` : 'No minimum'}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-900 font-semibold">{coupon.usedCount}</span>
                        <span className="text-gray-500">/</span>
                        <span className="text-gray-600">{coupon.usageLimit || '∞'}</span>
                      </div>
                      {coupon.usageLimit && (
                        <div className="w-24 h-2 bg-gray-200 rounded-full mt-2">
                          <div
                            className="h-full bg-gray-700 rounded-full"
                            style={{ width: `${Math.min((coupon.usedCount / coupon.usageLimit) * 100, 100)}%` }}
                          ></div>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-700 whitespace-nowrap">{coupon.startDate}</p>
                      <p className="text-sm text-gray-500 whitespace-nowrap">{coupon.endDate || 'No expiry'}</p>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[coupon.status] || 'bg-gray-100'}`}>
                        {coupon.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(coupon)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-edit-line text-lg"></i>
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
                          <i className="ri-delete-bin-line text-lg"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-lg max-w-lg w-full space-y-4">
            <h2 className="text-xl font-bold">{showEditModal ? 'Edit Coupon' : 'Create Coupon'}</h2>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono"
                placeholder="SAVE10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed Amount</option>
                  <option value="free_shipping">Free Shipping</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={form.type === 'free_shipping'}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 disabled:bg-gray-100"
                  placeholder={form.type === 'percentage' ? '10' : '50'}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min purchase</label>
                <input
                  type="number"
                  min="0"
                  value={form.minimum_purchase}
                  onChange={(e) => setForm((f) => ({ ...f, minimum_purchase: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usage limit</label>
                <input
                  type="number"
                  min="1"
                  value={form.usage_limit}
                  onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Unlimited"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End date (optional)</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingCoupon(null); }}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveCoupon}
                className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-60"
              >
                {saving ? 'Saving…' : showEditModal ? 'Save changes' : 'Create coupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
