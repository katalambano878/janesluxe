'use client';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        <i className="ri-error-warning-line text-5xl text-red-500 mb-4 block" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-600 text-sm mb-6">
          {error.message || 'An unexpected error occurred in the admin panel.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
