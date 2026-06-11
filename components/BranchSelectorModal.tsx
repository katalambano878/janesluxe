'use client';

import { useBranch } from '@/context/BranchContext';
import { SITE_NAME } from '@/lib/site-config';

/**
 * Popup that asks the customer which shop (branch) they want to shop from.
 * Shows automatically when no branch has been selected yet, and can be
 * re-opened via the branch pill / `openSelector()`.
 */
export default function BranchSelectorModal() {
  const { branches, branch, isReady, selectBranch, isSelectorOpen, closeSelector } = useBranch();

  // Nothing to choose between
  if (!isReady || branches.length < 2) return null;

  const mustChoose = !branch;
  const visible = mustChoose || isSelectorOpen;
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-brand-text/60 backdrop-blur-sm"
        onClick={mustChoose ? undefined : closeSelector}
      />
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="bg-gradient-to-br from-brand-secondary via-brand-ivory to-brand-secondary px-6 pt-8 pb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/20">
            <i className="ri-store-2-line text-2xl text-brand-brown" />
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-brand-text">
            Welcome to {SITE_NAME}
          </h2>
          <p className="mt-1 text-sm text-brand-text/70">
            Which shop would you like to shop from today?
          </p>
        </div>

        <div className="px-6 py-6 space-y-3">
          {branches.map((b) => {
            const isActive = branch?.id === b.id;
            return (
              <button
                key={b.id}
                onClick={() => selectBranch(b)}
                className={`w-full flex items-center justify-between rounded-2xl border-2 px-5 py-4 text-left transition-all cursor-pointer ${
                  isActive
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-brand-supporting/30 hover:border-brand-primary hover:bg-brand-primary/5'
                }`}
              >
                <div>
                  <p className="font-semibold text-brand-text">{b.name}</p>
                  {b.address && (
                    <p className="text-xs text-brand-text/60 mt-0.5">{b.address}</p>
                  )}
                </div>
                <i
                  className={`text-xl ${
                    isActive
                      ? 'ri-checkbox-circle-fill text-brand-primary'
                      : 'ri-arrow-right-circle-line text-brand-supporting'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {!mustChoose && (
          <div className="px-6 pb-6 text-center">
            <button
              onClick={closeSelector}
              className="text-sm text-brand-text/60 hover:text-brand-text font-medium cursor-pointer"
            >
              Keep shopping at {branch?.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
