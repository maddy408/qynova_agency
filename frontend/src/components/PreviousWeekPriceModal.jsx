import React, { useEffect, useRef } from 'react';
import { X, AlertCircle, Calendar, Tag, History } from 'lucide-react';
import { Button } from './Button.jsx';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Informational popup showing a product's previous week's selling price vs current selling price,
 * the last selling price, and all rate changes recorded during the past 1 year.
 * Accessible (role="dialog", Esc/Enter to close, focus returned on close, responsive down to 375px).
 * Purely displays selling prices — never displays or reads cost/purchase information.
 */
export function PreviousWeekPriceModal({ isOpen, onClose, data, loading, error }) {
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);

  // Store the element that had focus before the modal opened to return focus on close
  useEffect(() => {
    if (isOpen) {
      returnFocusRef.current = document.activeElement;
      // Focus modal or close button on open
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    } else if (returnFocusRef.current) {
      try {
        returnFocusRef.current.focus();
      } catch (e) {
        // Safe fallback if element is unmounted
      }
    }
  }, [isOpen]);

  // Handle keyboard events: Escape or Enter closes the modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lastSale = data?.last_sale;
  const prevWeek = data?.previous_week;

  // Collect distinct past selling amounts
  const previousAmounts = [];
  if (lastSale?.price) {
    previousAmounts.push(lastSale.price);
  }
  if (Array.isArray(data?.yearly_prices)) {
    data.yearly_prices.forEach((yp) => {
      if (yp.price && !previousAmounts.includes(yp.price)) {
        previousAmounts.push(yp.price);
      }
    });
  }
  if (prevWeek?.single_price && !previousAmounts.includes(prevWeek.single_price)) {
    previousAmounts.push(prevWeek.single_price);
  }
  if (Array.isArray(prevWeek?.prices)) {
    prevWeek.prices.forEach((p) => {
      if (p.price && !previousAmounts.includes(p.price)) {
        previousAmounts.push(p.price);
      }
    });
  }

  const primaryLastAmount = previousAmounts[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prev-week-price-title"
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-[#D5E3F7] overflow-hidden text-[#0B1B45] flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1C3675] bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#1C3675] px-5 py-4 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-[#E8C985] shadow-xs">
              <Tag size={18} />
            </span>
            <div>
              <h2 id="prev-week-price-title" className="text-sm font-bold text-white tracking-tight">
                Last Amount Details
              </h2>
              {data && (
                <p className="text-xs text-white/70 font-medium">
                  {data.code ? `${data.code} • ` : ''}Unit: {data.unit || 'PCS'}
                </p>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-xl p-1.5 text-white/70 hover:bg-white/15 hover:text-white transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {loading && (
            <div className="py-8 flex flex-col items-center justify-center text-center gap-2.5">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2449C6] border-t-transparent" />
              <p className="text-xs font-semibold text-slate-500">Checking selling price records…</p>
            </div>
          )}

          {error && !loading && (
            <div className="py-4">
              <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3.5 text-amber-900 border border-amber-200/80 mb-4 text-xs font-medium">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold">Could not fetch selling price</p>
                  <p className="mt-0.5 text-amber-800">{error}</p>
                </div>
              </div>
              <Button variant="secondary" className="w-full text-xs" onClick={onClose}>
                Continue Selling
              </Button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-4">
              {/* Product Title Card */}
              <div className="rounded-2xl bg-[#F8FAFD] p-3.5 border border-[#EAF1FA]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[#0B1B45] text-sm sm:text-base leading-tight">
                      {data.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <Tag size={12} className="text-slate-400" />
                        Tier: <span className="font-bold capitalize text-[#0B1B45]">{data.pricing_tier}</span>
                      </span>
                    </div>
                  </div>
                  {data.offer_active && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200/80">
                      Offer Active
                    </span>
                  )}
                </div>
              </div>

              {/* Price Cards Grid: Current Rate & Last Amount */}
              <div className="grid grid-cols-2 gap-3">
                {/* Current Price Box */}
                <div className="rounded-2xl border border-[#D5E3F7] p-3.5 bg-gradient-to-br from-[#EDF5FF] to-[#E3EEFC] shadow-2xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#2449C6]">
                    Current Rate
                  </div>
                  <div className="mt-1 text-base sm:text-xl font-black text-[#0B1B45]">
                    ₹{data.current_price}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-600">
                    {data.offer_active ? `Normal: ₹${data.normal_price}` : 'Effective Rate'}
                  </div>
                </div>

                {/* Last Amount Box */}
                <div className="rounded-2xl border border-[#D5E3F7] p-3.5 bg-white shadow-2xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#0B1B45]">
                    Last Amount
                  </div>
                  <div className="mt-1 text-base sm:text-xl font-black text-[#0B1B45]">
                    {primaryLastAmount ? (
                      `₹${primaryLastAmount}`
                    ) : (
                      <span className="text-xs font-normal text-slate-400 italic">No Sales</span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    {lastSale?.sold_on ? formatDate(lastSale.sold_on) : (primaryLastAmount ? 'Previous rate' : 'No previous sale')}
                  </div>
                </div>
              </div>

              {/* All Previous Amounts (if multiple rates were recorded) */}
              {previousAmounts.length > 1 && (
                <div className="rounded-2xl border border-[#D5E3F7] bg-white p-3.5 shadow-2xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Last Amounts
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previousAmounts.map((price, idx) => (
                      <span
                        key={idx}
                        className="rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3.5 py-1.5 text-sm font-black text-[#0B1B45] shadow-2xs"
                      >
                        ₹{price}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dismiss / Close Action */}
              <div className="pt-2">
                <Button variant="primary" className="w-full text-xs" onClick={onClose}>
                  Got It (Enter / Esc)
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



