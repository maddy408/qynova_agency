import React from 'react';

/**
 * Reusable Pagination component with 10 records per page standard
 * @param {number} page - Current page (1-based)
 * @param {number} total - Total records count
 * @param {number} limit - Items per page (default 10)
 * @param {function} onPageChange - Callback when page changes
 * @param {string} label - Optional entity label (e.g., 'items', 'records')
 * @param {string} className - Optional container styling
 */
export default function Pagination({
  page = 1,
  total = 0,
  limit = 10,
  onPageChange,
  label = 'records',
  className = '',
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (total <= 0) return null;

  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  // Generate page numbers to show (smart window around current page)
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (page >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 bg-gray-50/70 px-4 py-2.5 text-xs select-none ${className}`}
    >
      <span className="text-gray-700 font-medium">
        Showing <span className="font-bold text-slate-900">{startRecord}</span>–
        <span className="font-bold text-slate-900">{endRecord}</span> of{' '}
        <span className="font-bold text-blue-900">{total}</span> {label}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-100 hover:border-gray-400 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-300 transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          <span>Previous</span>
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="px-1 text-gray-400 font-bold">
                  …
                </span>
              );
            }
            const isActive = p === page;
            return (
              <button
                key={`page-${p}`}
                type="button"
                onClick={() => onPageChange(p)}
                className={`min-w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <span className="sm:hidden font-bold text-slate-800 px-1.5">
          {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-slate-100 hover:border-gray-400 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-300 transition-all cursor-pointer"
        >
          <span>Next</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
