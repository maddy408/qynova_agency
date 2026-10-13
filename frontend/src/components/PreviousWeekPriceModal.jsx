import React, { useEffect, useRef } from 'react';
import { X, TrendingUp, TrendingDown, Minus, AlertCircle, Calendar, Tag, Layers, Check } from 'lucide-react';
import { Button } from './Button.jsx';
import { Badge } from './Badge.jsx';

/**
 * Informational popup showing a product's previous week's selling price vs current selling price.
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

  const formatDateRange = (fromStr, toStr) => {
    if (!fromStr || !toStr) return '';
    try {
      const d1 = new Date(fromStr.replace(' ', 'T'));
      // Exclusive to_time is Monday 00:00:00, display Sunday date for inclusive user-friendly week
      const d2 = new Date(toStr.replace(' ', 'T'));
      d2.setDate(d2.getDate() - 1);

      const f1 = `${String(d1.getDate()).padStart(2, '0')}/${String(d1.getMonth() + 1).padStart(2, '0')}/${d1.getFullYear()}`;
      const f2 = `${String(d2.getDate()).padStart(2, '0')}/${String(d2.getMonth() + 1).padStart(2, '0')}/${d2.getFullYear()}`;
      return `${f1} – ${f2}`;
    } catch (e) {
      return `${fromStr} to ${toStr}`;
    }
  };

  const prevWeek = data?.previous_week;
  const difference = data?.difference;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prev-week-price-title"
        className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-100 overflow-hidden text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Calendar size={16} />
            </span>
            <div>
              <h2 id="prev-week-price-title" className="text-sm font-semibold text-gray-800">
                Previous Week Selling Price
              </h2>
              {data && (
                <p className="text-xs text-gray-500 font-normal">
                  {data.code ? `${data.code} • ` : ''}Unit: {data.unit || 'PCS'}
                </p>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5">
          {loading && (
            <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <p className="text-xs text-gray-500">Checking last week's sales records…</p>
            </div>
          )}

          {error && !loading && (
            <div className="py-4">
              <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-amber-800 border border-amber-200/60 mb-4 text-xs">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Could not fetch selling price history</p>
                  <p className="mt-0.5 text-amber-700">{error}</p>
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
              <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-tight">
                      {data.name}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Tag size={12} className="text-gray-400" />
                        Tier: <span className="font-medium capitalize text-gray-700">{data.pricing_tier}</span>
                      </span>
                    </div>
                  </div>
                  {data.offer_active && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                      Offer Active
                    </span>
                  )}
                </div>
              </div>

              {/* Price Comparison Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Previous Week Price Box */}
                <div className="rounded-lg border border-gray-200 p-3 bg-white">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                    Previous Week Rate
                  </div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-gray-800">
                    {prevWeek?.has_data ? (
                      prevWeek.single_price ? (
                        `₹${prevWeek.single_price}`
                      ) : (
                        <span className="text-xs sm:text-sm font-semibold text-gray-700">
                          ₹{prevWeek.lowest} – ₹{prevWeek.highest}
                        </span>
                      )
                    ) : (
                      <span className="text-xs font-normal text-gray-400 italic">No Sales</span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {prevWeek?.has_data && prevWeek.sales_count > 0 ? (
                      `${prevWeek.sales_count} bill${prevWeek.sales_count > 1 ? 's' : ''}`
                    ) : (
                      'None'
                    )}
                  </div>
                </div>

                {/* Current Price Box */}
                <div className="rounded-lg border border-indigo-100 p-3 bg-indigo-50/30">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-indigo-700">
                    Current Selling Rate
                  </div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-indigo-900">
                    ₹{data.current_price}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {data.offer_active ? `Normal: ₹${data.normal_price}` : 'Effective Rate'}
                  </div>
                </div>
              </div>

              {/* Price Difference Banner */}
              {difference?.comparable && prevWeek?.has_data && (
                <div
                  className={`flex items-center justify-between rounded-lg p-2.5 px-3 border text-xs ${
                    difference.direction === 'up'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : difference.direction === 'down'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-gray-50 border-gray-200 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {difference.direction === 'up' && (
                      <>
                        <TrendingUp size={15} className="text-rose-600" />
                        <span>Price Increased [Higher]</span>
                      </>
                    )}
                    {difference.direction === 'down' && (
                      <>
                        <TrendingDown size={15} className="text-emerald-600" />
                        <span>Price Decreased [Lower]</span>
                      </>
                    )}
                    {difference.direction === 'no_change' && (
                      <>
                        <Minus size={15} className="text-gray-500" />
                        <span>Price Unchanged [Same]</span>
                      </>
                    )}
                  </div>
                  <div className="font-bold text-right">
                    {difference.direction === 'up' ? `+₹${difference.amount}` : `₹${difference.amount}`}
                    <span className="ml-1 text-[11px] opacity-80">({difference.percent}%)</span>
                  </div>
                </div>
              )}

              {/* 1 Year Selling Prices History */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-2.5">
                <div className="text-[11px] font-semibold text-gray-700 mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Layers size={13} className="text-gray-400" />
                    <span>1 Year Selling Prices:</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-normal">Past 12 Months</span>
                </div>
                {data.yearly_prices && data.yearly_prices.length > 0 ? (
                  <div className="space-y-1 max-h-28 overflow-y-auto text-xs">
                    {data.yearly_prices.map((yp, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-1.5 px-2 rounded border border-gray-100 text-[11px]">
                        <span className="font-bold text-gray-900">₹{yp.price}</span>
                        <span className="text-gray-500 text-[10px]">
                          Last sold: {yp.last_sold_date ? yp.last_sold_date.split('-').reverse().join('/') : 'N/A'}
                        </span>
                        <span className="text-gray-600 font-medium text-[11px]">
                          {yp.quantity} {data.unit} ({yp.bills} {yp.bills > 1 ? 'bills' : 'bill'})
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 text-center py-1">
                    No sales in the past 1 year for this product.
                  </div>
                )}
              </div>

              {/* Missing data or Ambiguity message */}
              {data.message && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded p-2 border border-gray-100">
                  {data.message}
                </p>
              )}

              {/* Date Range Footer */}
              {prevWeek?.from && prevWeek?.to_exclusive && (
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                  <span>Previous Week Range:</span>
                  <span className="font-medium text-gray-500">
                    {formatDateRange(prevWeek.from, prevWeek.to_exclusive)}
                  </span>
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
