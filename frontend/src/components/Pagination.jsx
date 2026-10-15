import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Reusable Pagination component with 10 records per page standard
 * @param {number} page - Current page (1-based)
 * @param {number} total - Total records count
 * @param {number} limit - Items per page (default 10)
 * @param {function} onPageChange - Callback when page changes
 * @param {string} label - Optional entity label (e.g., 'customers', 'items')
 */
export function Pagination({ page = 1, total = 0, limit = 10, onPageChange, label = 'records', className = '' }) {
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
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#D8E6F7] bg-[#F8FAFD]/80 px-4 py-2.5 text-xs select-none ${className}`}>
      <span className="text-[#1E293B] font-semibold">
        Showing <span className="font-bold text-[#0B1B45]">{startRecord}</span>–<span className="font-bold text-[#0B1B45]">{endRecord}</span> of <span className="font-bold text-[#2449C6]">{total}</span> {label}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-1 text-xs font-bold text-[#0B1B45] shadow-2xs hover:bg-[#EDF5FF] hover:border-[#2449C6] disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-[#D5E3F7] transition-all cursor-pointer"
        >
          <ChevronLeft size={14} />
          <span>Previous</span>
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === '...') {
              return <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 font-bold">…</span>;
            }
            const isActive = p === page;
            return (
              <button
                key={`page-${p}`}
                type="button"
                onClick={() => onPageChange(p)}
                className={`min-w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#0B1B45] to-[#1C3675] text-[#E8C985] shadow-xs'
                    : 'text-[#0B1B45] hover:bg-[#EDF5FF] hover:text-[#2449C6]'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <span className="sm:hidden font-bold text-[#0B1B45] px-1.5">
          {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-1 text-xs font-bold text-[#0B1B45] shadow-2xs hover:bg-[#EDF5FF] hover:border-[#2449C6] disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-[#D5E3F7] transition-all cursor-pointer"
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
