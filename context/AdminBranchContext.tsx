'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

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

  const refreshBranches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, slug, address, phone, is_active, sort_order')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const list = (data || []) as AdminBranch[];
      setBranches(list);

      // Restore saved selection (if branch still exists)
      try {
        const savedId = window.localStorage.getItem(STORAGE_KEY);
        if (savedId) {
          const saved = list.find((b) => b.id === savedId) || null;
          setSelectedBranch(saved);
        }
      } catch { /* ignore */ }
    } catch (err) {
      console.warn('Failed to load branches:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBranches();
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
