'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { useAdminBranch } from '@/context/AdminBranchContext';

/**
 * Header dropdown: pick which branch's data the admin panel shows,
 * and toggle any branch open/closed for customers.
 */
export default function AdminBranchSwitcher() {
  const { branches, selectedBranch, selectBranch, refreshBranches, loading } = useAdminBranch();
  const [open, setOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (loading || branches.length === 0) return null;

  const label = selectedBranch ? selectedBranch.name : 'All Branches';
  const activeCount = branches.filter((b) => b.is_active).length;

  const toggleBranch = async (e: ReactMouseEvent, branchId: string, currentlyActive: boolean) => {
    e.stopPropagation();
    e.preventDefault();

    if (currentlyActive && activeCount <= 1) {
      alert('You must keep at least one active branch.');
      return;
    }

    const branch = branches.find((b) => b.id === branchId);
    const name = branch?.name || 'this branch';
    if (currentlyActive) {
      if (!confirm(`Turn off ${name}? Customers will no longer be able to shop from it.`)) return;
    }

    try {
      setTogglingId(branchId);
      const res = await fetch('/api/admin/branches', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: branchId, is_active: !currentlyActive }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update branch');

      await refreshBranches();
      if (selectedBranch?.id === branchId && currentlyActive) {
        selectBranch(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update branch');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-supporting/40 bg-white hover:bg-brand-secondary/50 transition-colors cursor-pointer"
        title="Switch branch"
      >
        <i className="ri-store-2-line text-brand-accent" />
        <span className="text-sm font-semibold text-brand-text max-w-[140px] truncate">{label}</span>
        <i className={`ri-arrow-down-s-line text-brand-supporting transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-brand-supporting/30 rounded-xl shadow-lg overflow-hidden z-30">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Viewing data for</p>
          </div>
          <button
            onClick={() => { selectBranch(null); setOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer ${!selectedBranch ? 'bg-brand-primary/10' : ''}`}
          >
            <div className="flex items-center gap-2">
              <i className="ri-global-line text-gray-500" />
              <span className="text-sm font-medium text-gray-900">All Branches</span>
            </div>
            {!selectedBranch && <i className="ri-check-line text-brand-accent" />}
          </button>

          <div className="px-4 py-2 border-t border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Branches · tap switch to open/close
            </p>
          </div>

          {branches.map((b) => (
            <div
              key={b.id}
              className={`flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 ${selectedBranch?.id === b.id ? 'bg-brand-primary/10' : ''}`}
            >
              <button
                type="button"
                onClick={() => { selectBranch(b); setOpen(false); }}
                className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer"
                title={b.is_active ? 'View this branch' : 'Branch is closed for customers'}
              >
                <i className={`ri-store-2-line ${b.is_active ? 'text-gray-500' : 'text-gray-300'}`} />
                <div className="min-w-0">
                  <span className={`text-sm font-medium truncate block ${b.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                    {b.name}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase ${b.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                    {b.is_active ? 'Open' : 'Closed'}
                  </span>
                </div>
                {selectedBranch?.id === b.id && <i className="ri-check-line text-brand-accent ml-auto" />}
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={b.is_active}
                aria-label={`${b.is_active ? 'Turn off' : 'Turn on'} ${b.name}`}
                disabled={togglingId === b.id}
                onClick={(e) => toggleBranch(e, b.id, b.is_active)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 cursor-pointer ${
                  b.is_active ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    b.is_active ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}

          <Link
            href="/admin/branches"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm font-medium text-brand-accent border-t border-gray-100 hover:bg-gray-50"
          >
            Manage branches →
          </Link>
        </div>
      )}
    </div>
  );
}
