'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

export interface Branch {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
}

interface BranchContextType {
  branches: Branch[];
  branch: Branch | null;
  /** True once branches are loaded and any saved selection has been restored */
  isReady: boolean;
  selectBranch: (branch: Branch) => void;
  openSelector: () => void;
  isSelectorOpen: boolean;
  closeSelector: () => void;
}

const STORAGE_KEY = 'selected_branch';

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadBranches() {
      try {
        const res = await fetch('/api/storefront/branches', { cache: 'no-store' });
        if (!isMounted) return;
        if (!res.ok) {
          setIsReady(true);
          return;
        }
        const data: Branch[] = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          setIsReady(true);
          return;
        }
        setBranches(data);

        // Restore the saved selection if it still matches an active branch
        let saved: Branch | null = null;
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            saved = data.find((b) => b.id === parsed?.id || b.slug === parsed?.slug) || null;
          }
        } catch { /* ignore */ }

        if (saved) {
          setBranch(saved);
        } else if (data.length === 1) {
          setBranch(data[0]);
          try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data[0])); } catch { /* ignore */ }
        }
        setIsReady(true);
      } catch {
        if (isMounted) setIsReady(true);
      }
    }

    loadBranches();
    return () => { isMounted = false; };
  }, []);

  const selectBranch = useCallback((b: Branch) => {
    setBranch(b);
    setIsSelectorOpen(false);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
  }, []);

  const openSelector = useCallback(() => setIsSelectorOpen(true), []);
  const closeSelector = useCallback(() => setIsSelectorOpen(false), []);

  return (
    <BranchContext.Provider value={{ branches, branch, isReady, selectBranch, openSelector, isSelectorOpen, closeSelector }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within a BranchProvider');
  return ctx;
}
