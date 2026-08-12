'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { fetchWithTimeout, readJsonSafe } from '@/lib/http';

export interface AdminBranch {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
  sort_order: number;
}

interface AdminBranchContextType {
  branches: AdminBranch[];
  /** null = "All branches" */
  selectedBranch: AdminBranch | null;
  selectBranch: (branch: AdminBranch | null) => void;
  refreshBranches: () => Promise<void>;
  loading: boolean;
}

const STORAGE_KEY = 'admin_selected_branch';

const AdminBranchContext = createContext<AdminBranchContextType | undefined>(undefined);

export function AdminBranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<AdminBranch | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshBranches = useCallback(async (signal?: AbortSignal) => {
    try {
      let list: AdminBranch[] = [];
      const res = await fetchWithTimeout('/api/admin/branches', {
        credentials: 'include',
        timeoutMs: 15000,
        signal,
      });
      if (res.ok) {
        const json = await readJsonSafe<{ branches?: AdminBranch[] }>(res);
        list = (json?.branches || []) as AdminBranch[];
      } else {
        const pubRes = await fetchWithTimeout('/api/storefront/branches', {
          cache: 'no-store',
          timeoutMs: 15000,
          signal,
        });
        if (pubRes.ok) {
          const pub = await readJsonSafe<unknown[]>(pubRes);
          list = (Array.isArray(pub) ? pub : []).map((b: any, i: number) => ({
            ...b,
            is_active: true,
            sort_order: b.sort_order ?? i,
          })) as AdminBranch[];
        }
      }
      setBranches(list);

      try {
        const savedId = window.localStorage.getItem(STORAGE_KEY);
        if (savedId) {
          const saved = list.find((b) => b.id === savedId) || null;
          setSelectedBranch(saved);
        }
      } catch { /* ignore */ }
    } catch (err) {
      if (signal?.aborted) return;
      console.warn('Failed to load branches:', err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refreshBranches(controller.signal);
    return () => controller.abort();
  }, [refreshBranches]);

  const selectBranch = useCallback((branch: AdminBranch | null) => {
    setSelectedBranch(branch);
    try {
      if (branch) window.localStorage.setItem(STORAGE_KEY, branch.id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  return (
    <AdminBranchContext.Provider value={{ branches, selectedBranch, selectBranch, refreshBranches, loading }}>
      {children}
    </AdminBranchContext.Provider>
  );
}

export function useAdminBranch() {
  const ctx = useContext(AdminBranchContext);
  if (!ctx) throw new Error('useAdminBranch must be used within an AdminBranchProvider');
  return ctx;
}
