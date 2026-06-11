'use client';

import { useEffect, useState } from 'react';
import { useAdminBranch } from '@/context/AdminBranchContext';

interface BranchRow {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
}

export default function BranchesPage() {
  const { refreshBranches, selectedBranch, selectBranch } = useAdminBranch();
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', address: '', phone: '' });

  // New branch form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', address: '', phone: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/branches', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load branches');
      setBranches(json.branches || []);
    } catch (err) {
      console.error('Error fetching branches:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (b: BranchRow) => {
    setEditingId(b.id);
    setEditForm({ name: b.name, address: b.address || '', phone: b.phone || '' });
  };

  const saveBranch = async (id: string) => {
    if (!editForm.name.trim()) {
      alert('Branch name is required');
      return;
    }
    try {
      setSavingId(id);
      const res = await fetch('/api/admin/branches', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editForm.name, address: editForm.address, phone: editForm.phone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update branch');
      setBranches((prev) => prev.map((b) => (b.id === id ? json.branch : b)));
      setEditingId(null);
      await refreshBranches();
      // Keep the header switcher label fresh if the renamed branch is selected
      if (selectedBranch?.id === id) selectBranch(json.branch);
    } catch (err: any) {
      alert(err.message || 'Failed to update branch');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (b: BranchRow) => {
    if (b.is_active) {
      const activeCount = branches.filter((x) => x.is_active).length;
      if (activeCount <= 1) {
        alert('You must keep at least one active branch.');
        return;
      }
      if (!confirm(`Deactivate ${b.name}? Customers will no longer be able to shop from it.`)) return;
    }
    try {
      setSavingId(b.id);
      const res = await fetch('/api/admin/branches', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, is_active: !b.is_active }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update branch');
      setBranches((prev) => prev.map((x) => (x.id === b.id ? json.branch : x)));
      await refreshBranches();
      if (selectedBranch?.id === b.id && !json.branch.is_active) selectBranch(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update branch');
    } finally {
      setSavingId(null);
    }
  };

  const createBranch = async () => {
    if (!newForm.name.trim()) {
      alert('Branch name is required');
      return;
    }
    try {
      setCreating(true);
      const res = await fetch('/api/admin/branches', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create branch');
      setBranches((prev) => [...prev, json.branch]);
      setNewForm({ name: '', address: '', phone: '' });
      setShowAddForm(false);
      await refreshBranches();
    } catch (err: any) {
      alert(err.message || 'Failed to create branch');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Branches</h1>
            <p className="text-gray-600 mt-1">
              Manage your shop locations. Rename branches, update contact details, and control which are open for customers.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            <i className="ri-add-line mr-2"></i>
            Add Branch
          </button>
        </div>

        {showAddForm && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">New Branch</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="e.g. East Legon Branch"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                <input
                  type="text"
                  value={newForm.address}
                  onChange={(e) => setNewForm({ ...newForm, address: e.target.value })}
                  placeholder="Location / address"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                <input
                  type="text"
                  value={newForm.phone}
                  onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                  placeholder="e.g. 0598000000"
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-3">
              <button
                onClick={createBranch}
                disabled={creating}
                className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create Branch'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-600 hover:text-gray-900 font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              New branches start with zero stock for every product. Set stock per product on the Inventory page after selecting the branch in the top bar.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-500">
              <i className="ri-loader-4-line animate-spin text-3xl"></i>
              <p className="mt-2">Loading branches...</p>
            </div>
          ) : branches.length === 0 ? (
            <div className="p-10 text-center text-gray-500">No branches yet. Add your first branch.</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {branches.map((b) => (
                <div key={b.id} className="p-6">
                  {editingId === b.id ? (
                    <div>
                      <div className="grid md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                          <input
                            type="text"
                            value={editForm.address}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                          <input
                            type="text"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center space-x-3">
                        <button
                          onClick={() => saveBranch(b.id)}
                          disabled={savingId === b.id}
                          className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {savingId === b.id ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-600 hover:text-gray-900 font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start space-x-4">
                        <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${b.is_active ? 'bg-brand-primary/15 text-brand-accent' : 'bg-gray-100 text-gray-400'}`}>
                          <i className="ri-store-2-line text-2xl"></i>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-900">{b.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {b.is_active ? 'Open' : 'Inactive'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {b.address || 'No address set'}
                            {b.phone ? ` · ${b.phone}` : ''}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">Slug: {b.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEditing(b)}
                          className="px-4 py-2 border-2 border-gray-300 hover:border-gray-400 text-gray-700 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                        >
                          <i className="ri-edit-line mr-1"></i>
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(b)}
                          disabled={savingId === b.id}
                          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer disabled:opacity-60 ${
                            b.is_active
                              ? 'border-2 border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-2 border-green-200 text-green-700 hover:bg-green-50'
                          }`}
                        >
                          {b.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <i className="ri-information-line text-xl text-blue-600 mt-0.5"></i>
            <div className="text-sm text-blue-800">
              <p className="font-semibold">How branches work</p>
              <ul className="mt-1 space-y-1 list-disc list-inside text-blue-700">
                <li>Customers pick a branch when they visit the store, and only see products in stock at that branch.</li>
                <li>Each order is tied to the branch the customer shopped from, and paid orders reduce that branch's stock.</li>
                <li>Use the switcher in the top bar to view the dashboard, orders, products and inventory for a single branch.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
