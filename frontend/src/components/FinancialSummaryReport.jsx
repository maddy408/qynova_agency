import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowLeft,
  AlertCircle,
  ShoppingCart,
  Truck,
  RotateCcw,
  ClipboardList,
  FileSpreadsheet,
  FileDown,
  Search,
  CheckCircle2,
  Calendar,
  DollarSign,
  Package,
  Layers,
  ArrowUpDown,
  RefreshCw,
} from 'lucide-react';
import { reportsApi } from '../api/admin';
import { Pagination } from './Pagination.jsx';
import { Button } from './Button.jsx';
import { downloadReportExcel, downloadReportPdf } from '../utils/reportPdf';

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

function formatCurrency(val) {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(val) {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinancialSummaryReport({ canExport = true, canViewCost = true, canProfit = true }) {
  // Date filter state
  const [preset, setPreset] = useState('this_month');
  const [fromDate, setFromDate] = useState(getFirstOfMonthStr());
  const [toDate, setToDate] = useState(getTodayStr());

  // Active detail view: null (shows summary cards) or 'profit' | 'product_loss' | 'stock_purchase' | 'stock_adjustment' | 'order_management' | 'total_sales'
  const [activeDetail, setActiveDetail] = useState(null);

  // Detail table controls
  const [detailPage, setDetailPage] = useState(1);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailSortBy, setDetailSortBy] = useState('');
  const [detailOrder, setDetailOrder] = useState('desc');

  // Handle Preset Changes
  const handleSelectPreset = (p) => {
    setPreset(p);
    setDetailPage(1);
    if (p === 'this_week') {
      setFromDate(getMondayThisWeekStr());
      setToDate(getTodayStr());
    } else if (p === 'this_month') {
      setFromDate(getFirstOfMonthStr());
      setToDate(getTodayStr());
    }
  };

  const handleCustomDateChange = (from, to) => {
    setPreset('custom');
    setDetailPage(1);
    if (from !== undefined) setFromDate(from);
    if (to !== undefined) setToDate(to);
  };

  // Fetch summary cards
  const summaryQuery = useQuery({
    queryKey: ['financial-summary', { fromDate, toDate, preset }],
    queryFn: ({ signal }) => reportsApi.financialSummary({ from: fromDate, to: toDate, preset }, signal),
    keepPreviousData: false,
  });

  const summary = summaryQuery.data;
  const cards = summary?.cards || {};
  const meta = summary?.meta || {};
  const warnings = meta.warnings || [];
  const hasData = meta.has_data !== false;

  // Detail view query function mapping
  const detailFetchers = {
    profit: (params, signal) => reportsApi.profitDetail(params, signal),
    product_loss: (params, signal) => reportsApi.productLossDetail(params, signal),
    stock_purchase: (params, signal) => reportsApi.stockPurchaseDetail(params, signal),
    stock_adjustment: (params, signal) => reportsApi.stockAdjustmentDetail(params, signal),
    order_management: (params, signal) => reportsApi.orderManagementDetail(params, signal),
    total_sales: (params, signal) => reportsApi.totalSalesDetail(params, signal),
  };

  const detailTitles = {
    profit: 'Profit & Loss Detail Report',
    product_loss: 'Product Loss Detail Report',
    stock_purchase: 'Stock Purchase & Returns Report',
    stock_adjustment: 'Stock Adjustment & Count Report',
    order_management: 'Order Management Detail Report',
    total_sales: 'Total Sales Detail Report',
  };

  // Fetch detail table
  const detailQuery = useQuery({
    queryKey: ['financial-summary-detail', activeDetail, { fromDate, toDate, preset, detailPage, detailSearch, detailSortBy, detailOrder }],
    queryFn: ({ signal }) => {
      if (!activeDetail || !detailFetchers[activeDetail]) return null;
      return detailFetchers[activeDetail](
        {
          from: fromDate,
          to: toDate,
          preset,
          page: detailPage,
          limit: 10,
          search: detailSearch,
          sort_by: detailSortBy,
          order: detailOrder,
        },
        signal
      );
    },
    enabled: !!activeDetail,
    keepPreviousData: true,
  });

  const detailData = detailQuery.data || {};
  const detailRows = detailData.rows || [];
  const detailCols = detailData.columns || {};
  const detailTotals = detailData.totals || {};
  const detailMeta = detailData.meta || {};

  const handleOpenDetail = (viewKey) => {
    setActiveDetail(viewKey);
    setDetailPage(1);
    setDetailSearch('');
    setDetailSortBy('');
    setDetailOrder('desc');
  };

  const handleBackToSummary = () => {
    setActiveDetail(null);
  };

  // Sort toggle
  const handleSort = (colKey) => {
    if (detailSortBy === colKey) {
      setDetailOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setDetailSortBy(colKey);
      setDetailOrder('desc');
    }
    setDetailPage(1);
  };

  // Excel / PDF export for detail table
  const handleExportDetailExcel = () => {
    if (!detailRows.length) return;
    downloadReportExcel({
      title: detailTitles[activeDetail] || 'Report',
      columns: detailCols,
      rows: detailRows,
      totalsRow: detailTotals,
      filename: `${activeDetail || 'report'}_${fromDate}_to_${toDate}.xlsx`,
    });
  };

  const handleExportDetailPdf = () => {
    if (!detailRows.length) return;
    downloadReportPdf({
      title: detailTitles[activeDetail] || 'Report',
      dateRange: `${fromDate} to ${toDate}`,
      columns: detailCols,
      rows: detailRows,
      totalsRow: detailTotals,
      filename: `${activeDetail || 'report'}_${fromDate}_to_${toDate}.pdf`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Date Filter Bar */}
      <div className="rounded-2xl border border-[#D5E3F7] bg-white p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64789D] mr-1 flex items-center gap-1.5">
              <Calendar size={14} className="text-[#315BFF]" /> Date Filter:
            </span>
            <button
              type="button"
              id="btn-preset-this-week"
              onClick={() => handleSelectPreset('this_week')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                preset === 'this_week'
                  ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                  : 'bg-[#F8FAFD] text-[#0F1E4A] border border-[#D5E3F7] hover:bg-[#EEF5FF]'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              id="btn-preset-this-month"
              onClick={() => handleSelectPreset('this_month')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                preset === 'this_month'
                  ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                  : 'bg-[#F8FAFD] text-[#0F1E4A] border border-[#D5E3F7] hover:bg-[#EEF5FF]'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              id="btn-preset-custom"
              onClick={() => setPreset('custom')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                preset === 'custom'
                  ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
                  : 'bg-[#F8FAFD] text-[#0F1E4A] border border-[#D5E3F7] hover:bg-[#EEF5FF]'
              }`}
            >
              Custom Range
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="filter-from-date" className="font-bold text-[#0F1E4A]">From:</label>
              <input
                type="date"
                id="filter-from-date"
                value={fromDate}
                onChange={(e) => handleCustomDateChange(e.target.value, undefined)}
                className="rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-1 text-xs font-semibold text-[#0F1E4A] focus:border-[#2449C6] focus:outline-none focus:ring-1 focus:ring-[#2449C6]"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="filter-to-date" className="font-bold text-[#0F1E4A]">To:</label>
              <input
                type="date"
                id="filter-to-date"
                value={toDate}
                onChange={(e) => handleCustomDateChange(undefined, e.target.value)}
                className="rounded-xl border border-[#D5E3F7] bg-white px-2.5 py-1 text-xs font-semibold text-[#0F1E4A] focus:border-[#2449C6] focus:outline-none focus:ring-1 focus:ring-[#2449C6]"
              />
            </div>

            {summaryQuery.isFetching && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#315BFF] animate-pulse">
                <RefreshCw size={13} className="animate-spin" /> Updating…
              </span>
            )}
          </div>
        </div>

        {/* Warnings Banner */}
        {warnings.length > 0 && (
          <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Financial Notice:</span>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                {warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* API Error State */}
        {summaryQuery.isError && (
          <div className="mt-3.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
            <span>Failed to load financial report data: {summaryQuery.error?.message || 'Server error'}.</span>
            <Button size="sm" variant="danger" onClick={() => summaryQuery.refetch()}>Retry</Button>
          </div>
        )}
      </div>

      {/* Main View: Cards Grid OR Detail Table */}
      {!activeDetail ? (
        /* Summary Cards Grid */
        <div className="space-y-6">
          {summaryQuery.isLoading ? (
            /* Loading Skeleton */
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 animate-pulse">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-slate-100 border border-slate-200" />
              ))}
            </div>
          ) : !hasData ? (
            /* Empty State */
            <div className="rounded-2xl border border-dashed border-[#D5E3F7] bg-white p-12 text-center">
              <Calendar size={36} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-[#0F1E4A]">No transactions for the selected period</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No invoices, purchases, stock movements, orders, or expenses were recorded between {fromDate} and {toDate}.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Top Banner: Five Highlight Cards (Profit, Product Loss, Stock Purchase, Stock Adjustment, Order Management) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[#0B1B45] flex items-center gap-1.5">
                    <TrendingUp size={15} className="text-[#315BFF]" /> Key Financial Management Cards
                  </h2>
                  <span className="text-[11px] font-semibold text-slate-400">Click any card to open its detail report</span>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {/* Card 1: Profit */}
                  {canProfit && cards.profit && (
                    <div
                      id="card-profit"
                      onClick={() => handleOpenDetail('profit')}
                      className="group relative cursor-pointer rounded-2xl border border-[#D5E3F7] bg-gradient-to-br from-[#EEF5FF] via-white to-[#E3EFFF] p-4 shadow-xs transition-all hover:border-[#315BFF] hover:shadow-md active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#315BFF]">Profit (Gross / Net)</span>
                        <ArrowUpRight size={15} className="text-slate-400 group-hover:text-[#315BFF] transition-colors" />
                      </div>
                      <div className="mt-1 text-lg font-black text-[#0B1B45]">
                        {formatCurrency(cards.profit.gross_profit)}
                      </div>
                      <div className="mt-2 space-y-0.5 text-[11px] font-semibold text-slate-600">
                        <div className="flex justify-between">
                          <span>Net Profit:</span>
                          <span className={`font-bold ${Number(cards.profit.net_profit) >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {formatCurrency(cards.profit.net_profit)}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>COGS:</span>
                          <span>{formatCurrency(cards.profit.cogs)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Margin:</span>
                          <span>{cards.profit.margin_percent}%</span>
                        </div>
                      </div>
                      {cards.profit.is_estimate && (
                        <div className="mt-2 text-[10px] font-bold text-amber-700 bg-amber-100/70 rounded-md px-1.5 py-0.5 inline-block">
                          Estimated (Missing Cost)
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card 2: Product Loss */}
                  <div
                    id="card-product-loss"
                    onClick={() => handleOpenDetail('product_loss')}
                    className="group relative cursor-pointer rounded-2xl border border-[#D5E3F7] bg-gradient-to-br from-[#FFF5F7] via-white to-[#FFE8ED] p-4 shadow-xs transition-all hover:border-[#F05B7A] hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#F05B7A]">Product Loss</span>
                      <ArrowUpRight size={15} className="text-slate-400 group-hover:text-[#F05B7A] transition-colors" />
                    </div>
                    <div className="mt-1 text-lg font-black text-[#0B1B45]">
                      {cards.product_loss?.loss_value !== null ? formatCurrency(cards.product_loss?.loss_value) : `${formatQty(cards.product_loss?.loss_qty)} units`}
                    </div>
                    <div className="mt-2 space-y-0.5 text-[11px] font-semibold text-slate-600">
                      <div className="flex justify-between">
                        <span>Lost Qty:</span>
                        <span className="font-bold text-[#F05B7A]">{formatQty(cards.product_loss?.loss_qty)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Incidents:</span>
                        <span>{cards.product_loss?.record_count || 0}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 italic">
                        Derived from damage &amp; spoilage adjustments
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Stock Purchase */}
                  <div
                    id="card-stock-purchase"
                    onClick={() => handleOpenDetail('stock_purchase')}
                    className="group relative cursor-pointer rounded-2xl border border-[#D5E3F7] bg-gradient-to-br from-[#F0FDF4] via-white to-[#DCFCE7] p-4 shadow-xs transition-all hover:border-[#10B981] hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#059669]">Stock Purchase</span>
                      <ArrowUpRight size={15} className="text-slate-400 group-hover:text-[#059669] transition-colors" />
                    </div>
                    <div className="mt-1 text-lg font-black text-[#0B1B45]">
                      {cards.stock_purchase?.net_purchased !== null ? formatCurrency(cards.stock_purchase?.net_purchased) : `${cards.stock_purchase?.purchase_count || 0} Bills`}
                    </div>
                    <div className="mt-2 space-y-0.5 text-[11px] font-semibold text-slate-600">
                      <div className="flex justify-between">
                        <span>Purchased Units:</span>
                        <span className="font-bold text-[#059669]">{formatQty(cards.stock_purchase?.purchase_qty)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Active GRNs:</span>
                        <span>{cards.stock_purchase?.purchase_count || 0}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Purchase Returns:</span>
                        <span>{formatCurrency(cards.stock_purchase?.returns_total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Stock Adjustment */}
                  <div
                    id="card-stock-adjustment"
                    onClick={() => handleOpenDetail('stock_adjustment')}
                    className="group relative cursor-pointer rounded-2xl border border-[#D5E3F7] bg-gradient-to-br from-[#F5F0FF] via-white to-[#EDE4FF] p-4 shadow-xs transition-all hover:border-[#7C3AED] hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7C3AED]">Stock Adjustment</span>
                      <ArrowUpRight size={15} className="text-slate-400 group-hover:text-[#7C3AED] transition-colors" />
                    </div>
                    <div className="mt-1 text-lg font-black text-[#0B1B45]">
                      {formatQty(cards.stock_adjustment?.net_adjustment_qty)} units
                    </div>
                    <div className="mt-2 space-y-0.5 text-[11px] font-semibold text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-emerald-700 font-bold">+ Added:</span>
                        <span className="font-bold text-emerald-700">{formatQty(cards.stock_adjustment?.addition_qty)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-rose-600 font-bold">- Deducted:</span>
                        <span className="font-bold text-rose-600">{formatQty(cards.stock_adjustment?.deduction_qty)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 pt-0.5">
                        Loss qty: {formatQty(cards.stock_adjustment?.loss_qty)} <span className="text-slate-500 font-medium">({cards.stock_adjustment?.loss_label})</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 5: Order Management */}
                  <div
                    id="card-order-management"
                    onClick={() => handleOpenDetail('order_management')}
                    className="group relative cursor-pointer rounded-2xl border border-[#D5E3F7] bg-gradient-to-br from-[#FFF9EB] via-white to-[#FEF3C7] p-4 shadow-xs transition-all hover:border-[#D97706] hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#D97706]">Order Management</span>
                      <ArrowUpRight size={15} className="text-slate-400 group-hover:text-[#D97706] transition-colors" />
                    </div>
                    <div className="mt-1 text-lg font-black text-[#0B1B45]">
                      {formatCurrency(cards.order_management?.total_value)}
                    </div>
                    <div className="mt-2 space-y-0.5 text-[11px] font-semibold text-slate-600">
                      <div className="flex justify-between">
                        <span>Total Prebookings:</span>
                        <span className="font-bold text-[#0B1B45]">{cards.order_management?.total_orders || 0}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Pending / Confirmed:</span>
                        <span>{(cards.order_management?.pending_count || 0) + (cards.order_management?.confirmed_count || 0)}</span>
                      </div>
                      <div className="flex justify-between text-rose-600 text-[10px]">
                        <span>Cancelled:</span>
                        <span>{cards.order_management?.cancelled_count || 0} ({formatCurrency(cards.order_management?.cancelled_orders_value)})</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Existing Financial Summary Cards (11 metrics from existing dashboard summary) */}
              <div className="space-y-2.5 pt-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Operational &amp; Working Capital Overview
                </h3>

                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
                  {/* Total Sales (Clickable -> Opens Total Sales Detail) */}
                  <div
                    id="card-total-sales"
                    onClick={() => handleOpenDetail('total_sales')}
                    className="group cursor-pointer rounded-2xl border border-[#D5E3F7] bg-gradient-to-br from-[#EEF5FF] to-[#E3EFFF] p-3.5 shadow-2xs hover:border-[#2449C6] hover:shadow-sm transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#315BFF]">Total Sales Revenue</div>
                      <ArrowUpRight size={13} className="text-slate-400 group-hover:text-[#2449C6] transition-colors" />
                    </div>
                    <div className="mt-1 text-base font-black text-[#0F1E4A]">
                      {formatCurrency(cards.total_sales_revenue)}
                    </div>
                    <span className="text-[10px] font-bold text-[#315BFF] group-hover:underline">View Sales &rarr;</span>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Cash Sales</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.cash_sales)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Credit Sales</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.credit_sales)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Total Purchases</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.total_purchases)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Inventory Valuation</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.inventory_valuation)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Customer Outstanding</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.customer_net_outstanding)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Supplier Outstanding</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.supplier_net_outstanding)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Collections in Period</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.employee_collections_today)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Operating Expenses</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.operating_expenses_today)}</div>
                  </div>

                  <div className="rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-3.5 shadow-2xs">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Extra / Other Income</div>
                    <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">{formatCurrency(cards.extra_income_today)}</div>
                  </div>

                  <div className={`rounded-2xl border border-[#D5E3F7] p-3.5 shadow-2xs ${Number(cards.low_stock_count) > 0 ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-[#F8FAFD] text-[#0F1E4A]'}`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Low Stock Alerts</div>
                    <div className="mt-1 text-base font-extrabold flex items-center gap-1.5">
                      {cards.low_stock_count || 0} item(s)
                      {Number(cards.low_stock_count) > 0 && <AlertCircle size={15} className="text-amber-600" />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Detailed Report View (Inside the same page, preserving date range) */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D5E3F7] pb-4">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                id="btn-back-to-summary"
                onClick={handleBackToSummary}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-xs font-bold text-[#0B1B45] hover:bg-[#EEF5FF] hover:border-[#2449C6] transition-all shadow-2xs cursor-pointer"
              >
                <ArrowLeft size={14} /> Back to Summary Cards
              </button>
              <div>
                <h2 className="text-base font-extrabold text-[#0B1B45]">{detailTitles[activeDetail]}</h2>
                <span className="text-[11px] text-slate-500 font-medium">Period: {fromDate} to {toDate}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search in table…"
                  value={detailSearch}
                  onChange={(e) => {
                    setDetailSearch(e.target.value);
                    setDetailPage(1);
                  }}
                  className="rounded-xl border border-[#D5E3F7] bg-white pl-8 pr-3 py-1.5 text-xs text-[#0F1E4A] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2449C6]"
                />
              </div>

              {canExport && (
                <>
                  <button
                    type="button"
                    onClick={handleExportDetailExcel}
                    disabled={!detailRows.length}
                    className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#0E7A4A] via-[#0B6B40] to-[#075633] text-white border border-[#075633] px-3 py-1.5 text-xs font-bold shadow-[0_2px_8px_rgba(11,107,64,0.28)] hover:brightness-110 disabled:opacity-50 transition"
                  >
                    <FileSpreadsheet size={13} className="text-emerald-100" /> Excel
                  </button>
                  <button
                    type="button"
                    onClick={handleExportDetailPdf}
                    disabled={!detailRows.length}
                    className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white px-3 py-1.5 text-xs font-bold shadow-xs hover:opacity-95 disabled:opacity-50 transition"
                  >
                    <FileDown size={13} className="text-[#E8C985]" /> PDF
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Table Container: STRICT 12px font size, sticky header, internal horizontal scroll */}
          <div className="overflow-x-auto rounded-2xl border border-[#D5E3F7] bg-white shadow-xs max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10 border-b border-[#D5E3F7] bg-[#F5F8FF] uppercase tracking-wider text-slate-600 font-bold text-xs">
                <tr>
                  {Object.entries(detailCols).map(([colKey, colLabel]) => {
                    const isNumeric = colKey.includes('amount') || colKey.includes('price') || colKey.includes('total') || colKey.includes('qty') || colKey.includes('cogs') || colKey.includes('profit') || colKey.includes('balance') || colKey.includes('tax') || colKey.includes('cost');
                    return (
                      <th
                        key={colKey}
                        onClick={() => handleSort(colKey)}
                        className={`px-3 py-2.5 cursor-pointer hover:bg-[#EAF1FA] transition-colors select-none whitespace-nowrap text-xs ${isNumeric ? 'text-right' : 'text-left'}`}
                      >
                        <div className={`inline-flex items-center gap-1 ${isNumeric ? 'justify-end' : ''}`}>
                          <span>{colLabel}</span>
                          <ArrowUpDown size={11} className={detailSortBy === colKey ? 'text-[#2449C6]' : 'text-slate-300'} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAF1FA] text-xs">
                {detailQuery.isLoading ? (
                  <tr>
                    <td colSpan={Math.max(1, Object.keys(detailCols).length)} className="px-4 py-12 text-center text-slate-400 text-xs">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-[#315BFF]" />
                      Loading report rows…
                    </td>
                  </tr>
                ) : detailRows.length === 0 ? (
                  <tr>
                    <td colSpan={Math.max(1, Object.keys(detailCols).length)} className="px-4 py-12 text-center text-slate-400 text-xs">
                      No records found for the selected period.
                    </td>
                  </tr>
                ) : (
                  detailRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-[#F8FAFD] transition-colors text-xs text-[#0B1B45]">
                      {Object.keys(detailCols).map((colKey) => {
                        const val = row[colKey];
                        const isNumeric = colKey.includes('amount') || colKey.includes('price') || colKey.includes('total') || colKey.includes('cogs') || colKey.includes('profit') || colKey.includes('balance') || colKey.includes('tax') || colKey.includes('cost');
                        const isQty = colKey.includes('qty') || colKey.includes('count');

                        let displayVal = val ?? '—';
                        if (isNumeric && val !== null && val !== undefined && !isNaN(Number(val))) {
                          displayVal = '₹' + Number(val).toFixed(2);
                        } else if (isQty && val !== null && val !== undefined && !isNaN(Number(val))) {
                          displayVal = Number(val).toFixed(2);
                        }

                        // Status badges
                        if (colKey === 'cost_status') {
                          displayVal = (
                            <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold ${val === 'Missing' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                              {val}
                            </span>
                          );
                        } else if (colKey === 'double_count_label') {
                          displayVal = (
                            <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold ${val.includes('Product Loss') ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'}`}>
                              {val}
                            </span>
                          );
                        } else if (colKey === 'financial_inclusion') {
                          displayVal = (
                            <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold ${val.includes('Excluded') ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
                              {val}
                            </span>
                          );
                        }

                        return (
                          <td key={colKey} className={`px-3 py-2 text-xs whitespace-nowrap ${isNumeric || isQty ? 'text-right font-medium' : 'text-left'}`}>
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>

              {/* Totals Row */}
              {detailRows.length > 0 && Object.keys(detailTotals).length > 0 && (
                <tfoot className="border-t-2 border-[#D5E3F7] bg-[#F5F8FF] font-bold text-xs text-[#0B1B45]">
                  <tr>
                    {Object.keys(detailCols).map((colKey, idx) => {
                      if (idx === 0) {
                        return <td key={colKey} className="px-3 py-2 text-left font-black text-xs uppercase">Totals:</td>;
                      }
                      const totVal = detailTotals[colKey] ?? detailTotals[`total_${colKey}`];
                      if (totVal !== undefined && totVal !== null) {
                        const isNum = !isNaN(Number(totVal));
                        return (
                          <td key={colKey} className="px-3 py-2 text-right font-black text-xs whitespace-nowrap text-[#2449C6]">
                            {isNum ? '₹' + Number(totVal).toFixed(2) : totVal}
                          </td>
                        );
                      }
                      return <td key={colKey} className="px-3 py-2 text-xs"></td>;
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            page={detailPage}
            total={detailMeta.total_rows || 0}
            limit={10}
            onPageChange={(p) => setDetailPage(p)}
            label="rows"
          />
        </div>
      )}
    </div>
  );
}
