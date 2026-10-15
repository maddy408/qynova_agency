import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  X,
  AlertCircle,
  ArrowUpRight,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { dashboardApi } from '../api/admin';

function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFirstOfMonthStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function getMondayThisWeekStr() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const date = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function formatMetric(val) {
  if (val === null || val === undefined) return '0';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  if (num === 0) return '0';
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export const MODAL_METRICS = [
  { key: 'today_sales_revenue', label: "Today's Sales Revenue", highlight: true },
  { key: 'month_sales_total', label: 'Monthly Sales Total' },
  { key: 'profit', label: 'Profit (Gross)', highlight: true },
  { key: 'order_management', label: 'Order Management' },

  { key: 'today_purchases', label: "Today's Purchases" },
  { key: 'month_purchases_total', label: 'Monthly Purchases Total' },
  { key: 'stock_purchase', label: 'Stock Purchases' },
  { key: 'inventory_valuation', label: 'Inventory Valuation' },

  { key: 'stock_loss', label: 'Stock Loss' },
  { key: 'stock_adjustment', label: 'Stock Adjustments' },
  { key: 'employee_collections_today', label: 'Collections Today' },
  { key: 'low_stock_count', label: 'Low Stock Alerts', isAlert: true },

  { key: 'customer_net_outstanding', label: 'Customer Net Outstanding' },
  { key: 'supplier_net_outstanding', label: 'Supplier Net Outstanding' },
  { key: 'operating_expenses_today', label: 'Expenses Today' },
  { key: 'extra_income_today', label: 'Extra Income Today' },
];

export function TotalsReportModal({ isOpen, onClose, initialData }) {
  const [preset, setPreset] = useState('this_month');
  const [fromDate, setFromDate] = useState(getFirstOfMonthStr());
  const [toDate, setToDate] = useState(getTodayStr());

  const handleSelectPreset = (p) => {
    setPreset(p);
    if (p === 'today') {
      const today = getTodayStr();
      setFromDate(today);
      setToDate(today);
    } else if (p === 'this_week') {
      setFromDate(getMondayThisWeekStr());
      setToDate(getTodayStr());
    } else if (p === 'this_month') {
      setFromDate(getFirstOfMonthStr());
      setToDate(getTodayStr());
    }
  };

  const handleCustomDateChange = (from, to) => {
    setPreset('custom');
    if (from !== undefined) setFromDate(from);
    if (to !== undefined) setToDate(to);
  };

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary-filtered', fromDate, toDate],
    queryFn: () => dashboardApi.summary({ from: fromDate, to: toDate }),
    enabled: isOpen,
    initialData: preset === 'this_month' ? initialData : undefined,
  });

  if (!isOpen) return null;

  const summary = summaryQuery.data || initialData || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-4xl rounded-3xl bg-white p-6 text-[#0F1E4A] shadow-2xl space-y-4 border border-[#D5E3F7] max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#D5E3F7] pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC] shadow-2xs">
              <TrendingUp size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide text-[#0F1E4A]">Financial Summary Report</h2>
              <p className="text-xs text-[#64789D]">Real-time revenue, purchase, stock &amp; outstanding overview</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-[#64789D] hover:bg-[#EDF5FF] hover:text-[#0F1E4A] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Date Filter & Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 py-1 px-1 bg-[#F8FAFD] rounded-2xl border border-[#E2ECF8] shrink-0 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64789D] px-2 flex items-center gap-1">
              <Calendar size={13} className="text-[#315BFF]" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => handleSelectPreset('today')}
              className={`rounded-xl px-2.5 py-1 font-bold transition-all text-xs ${
                preset === 'today'
                  ? 'bg-gradient-to-r from-[#0F1E4A] to-[#1C3372] text-white shadow-2xs'
                  : 'bg-white text-[#0F1E4A] border border-[#D5E3F7] hover:bg-[#EEF5FF]'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('this_week')}
              className={`rounded-xl px-2.5 py-1 font-bold transition-all text-xs ${
                preset === 'this_week'
                  ? 'bg-gradient-to-r from-[#0F1E4A] to-[#1C3372] text-white shadow-2xs'
                  : 'bg-white text-[#0F1E4A] border border-[#D5E3F7] hover:bg-[#EEF5FF]'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('this_month')}
              className={`rounded-xl px-2.5 py-1 font-bold transition-all text-xs ${
                preset === 'this_month'
                  ? 'bg-gradient-to-r from-[#0F1E4A] to-[#1C3372] text-white shadow-2xs'
                  : 'bg-white text-[#0F1E4A] border border-[#D5E3F7] hover:bg-[#EEF5FF]'
              }`}
            >
              This Month
            </button>
          </div>

          <div className="flex items-center gap-2 pr-1">
            <div className="flex items-center gap-1 text-[11px] font-medium text-[#64789D]">
              <span>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => handleCustomDateChange(e.target.value, undefined)}
                className="rounded-lg border border-[#D5E3F7] bg-white px-2 py-0.5 text-xs font-semibold text-[#0F1E4A]"
              />
            </div>
            <div className="flex items-center gap-1 text-[11px] font-medium text-[#64789D]">
              <span>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => handleCustomDateChange(undefined, e.target.value)}
                className="rounded-lg border border-[#D5E3F7] bg-white px-2 py-0.5 text-xs font-semibold text-[#0F1E4A]"
              />
            </div>
            {summaryQuery.isFetching && (
              <RefreshCw size={13} className="animate-spin text-[#315BFF] ml-1" />
            )}
          </div>
        </div>

        {/* 16 Metric Cards Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 overflow-y-auto pr-1 flex-1">
          {MODAL_METRICS.map((c) => {
            const rawVal = summary[c.key];

            if (c.isAlert) {
              const count = Number(rawVal || 0);
              return (
                <div
                  key={c.key}
                  id={`metric-${c.key}`}
                  className={`rounded-2xl border border-[#D5E3F7] p-3.5 shadow-2xs ${
                    count > 0 ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-[#F8FAFD] text-[#0F1E4A]'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">{c.label}</div>
                  <div className="mt-1 text-base font-extrabold text-[#0F1E4A] flex items-center gap-1.5">
                    {count} item(s)
                    {count > 0 && <AlertCircle className="h-4 w-4 text-amber-600" />}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={c.key}
                id={`metric-${c.key}`}
                className={`rounded-2xl border border-[#D5E3F7] p-3.5 shadow-2xs transition-all hover:border-[#315BFF]/50 ${
                  c.highlight
                    ? 'bg-gradient-to-br from-[#EEF5FF] to-[#E3EFFF] text-[#0F1E4A]'
                    : 'bg-[#F8FAFD] text-[#0F1E4A]'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">{c.label}</div>
                <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">
                  Rs. {formatMetric(rawVal)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-[#D5E3F7] shrink-0">
          <Link
            to="/reports"
            onClick={onClose}
            className="text-xs font-bold text-[#315BFF] hover:underline flex items-center gap-1"
          >
            Open Detailed Reports Page <ArrowUpRight size={14} />
          </Link>
          <button
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-[#0F1E4A] to-[#1C3372] px-4 py-2 text-xs font-bold text-white shadow-xs hover:opacity-95 transition-opacity"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
