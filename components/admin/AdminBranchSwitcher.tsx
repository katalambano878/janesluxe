'use client';

import { useEffect, useRef, useState } from 'react';
import { useAdminBranch } from '@/context/AdminBranchContext';

/**
 * Header dropdown that lets the admin pick which branch's data the whole
 * admin panel shows ("All branches" or a specific branch).
 */
export default function AdminBranchSwitcher() {
  const { branches, selectedBranch, selectBranch, loading } = useAdminBranch();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (loading || branches.length === 0) return null;

  const activeBranches = branches.filter((b) => b.is_active);
  const label = selectedBranch ? selectedBranch.name : 'All Branches';

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
        <div className="absolute right-0 mt-2 w-64 bg-white border border-brand-supporting/30 rounded-xl shadow-lg overflow-hidden z-30">
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
          {activeBranches.map((b) => (
            <button
              key={b.id}
              onClick={() => { selectBranch(b); setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer ${selectedBranch?.id === b.id ? 'bg-brand-primary/10' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <i className="ri-store-2-line text-gray-500" />
                <span className="text-sm font-medium text-gray-900 truncate">{b.name}</span>
              </div>
              {selectedBranch?.id === b.id && <i className="ri-check-line text-brand-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
