'use client';

import { useBranch } from '@/context/BranchContext';

/** Small header pill showing the currently selected shop; click to switch. */
export default function BranchPill() {
  const { branch, branches, openSelector } = useBranch();

  if (!branch || branches.length < 2) return null;

  return (
    <button
      onClick={openSelector}
      className="flex items-center gap-1 max-w-[120px] sm:max-w-none px-2.5 py-1 rounded-full bg-brand-secondary/70 hover:bg-brand-secondary text-brand-text/80 hover:text-brand-text text-[11px] sm:text-xs font-medium transition-colors cursor-pointer"
      aria-label={`Shopping from ${branch.name}. Click to change shop.`}
      title="Change shop"
    >
      <i className="ri-map-pin-2-fill text-brand-accent text-sm" />
      <span className="truncate">{branch.name.replace(/\s*branch\s*$/i, '')}</span>
      <i className="ri-arrow-down-s-line hidden sm:inline" />
    </button>
  );
}
