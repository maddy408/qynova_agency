import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, FileDown, PieChart } from 'lucide-react';
import { reportsApi } from '../api/admin';
import { pricingApi } from '../api/catalog';
import { Tabs } from '../components/Tabs';
import { Button } from '../components/Button.jsx';
import { FinancialSummaryReport } from '../components/FinancialSummaryReport.jsx';
import { TotalsReportModal } from '../components/TotalsReportModal.jsx';
import { usePermission } from '../hooks/usePermission';
import { downloadReportPdf, downloadReportExcel, NUMERIC_REPORT_KEYS } from '../utils/reportPdf';

/**
 * Custom hook to manage table row checkbox selection.
 */
function useTableSelection(rows = [], getRowKey) {
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // Reset selection when rows length changes or rows reset
  useEffect(() => {
    setSelectedKeys(new Set());
  }, [rows]);

  const defaultGetKey = (r, i) => r.id ?? r.invoice_no ?? r.grn_no ?? r.item_code ?? r.ref_no ?? i;
  const getKey = getRowKey || defaultGetKey;

  const allKeys = useMemo(() => rows.map((r, i) => getKey(r, i)), [rows, getKey]);
  const isAllSelected = allKeys.length > 0 && selectedKeys.size === allKeys.length;
  const isSomeSelected = selectedKeys.size > 0 && selectedKeys.size < allKeys.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allKeys));
    }
  };

  const toggleSelectRow = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectedRows = useMemo(() => {
    return rows.filter((r, i) => selectedKeys.has(getKey(r, i)));
  }, [rows, selectedKeys, getKey]);

  const clearSelection = () => setSelectedKeys(new Set());

  return {
    selectedKeys,
    selectedRows,
    selectedCount: selectedKeys.size,
    isAllSelected,
    isSomeSelected,
    toggleSelectAll,
    toggleSelectRow,
    clearSelection,
    getKey,
  };
}

/**
 * Shared date filter + Export Excel/PDF bar for every date-ranged report
 * with row selection support.
 */
function DateRangeBar({ from, to, setFrom, setTo, onApply, onReset, onExport, pdfConfig, excelConfig, canExport, selection }) {
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState('');

  const selectedCount = selection?.selectedCount || 0;

  const handleExportExcel = async () => {
    setExportError('');
    setExportingExcel(true);
    try {
      if (selectedCount > 0 && selection?.selectedRows) {
        const cols = excelConfig?.columns || pdfConfig?.columns;
        const filename = excelConfig?.filename || pdfConfig?.filename?.replace('.pdf', '.csv') || 'report.csv';
        const title = excelConfig?.title || pdfConfig?.title || 'Report';
        downloadReportExcel({
          title,
          columns: cols,
          rows: selection.selectedRows,
          totalsRow: excelConfig?.totalsRow || pdfConfig?.totalsRow,
          filename,
        });
      } else {
        await onExport();
      }
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    setExportError('');
    setExportingPdf(true);
    try {
      if (selectedCount > 0 && selection?.selectedRows && pdfConfig) {
        const rowsToExport = selection.selectedRows;
        let selectedTotalsRow = pdfConfig.totalsRow;
        if (selectedTotalsRow) {
          const totalKeys = Object.keys(selectedTotalsRow);
          selectedTotalsRow = Object.fromEntries(
            totalKeys.map((k) => [k, rowsToExport.reduce((s, r) => s + (Number(r[k]) || 0), 0)])
          );
        }
        downloadReportPdf({
          ...pdfConfig,
          rows: rowsToExport,
          totalsRow: selectedTotalsRow,
          filtersText: `${pdfConfig.filtersText || ''} (${selectedCount} selected)`,
        });
      } else {
        downloadReportPdf(pdfConfig);
      }
    } catch (err) {
      setExportError(err?.message || 'Unable to generate the PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
          />
        </div>
        <Button size="sm" onClick={onApply} className="shadow-xs">
          Apply Filter
        </Button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-[#F5F8FF] hover:text-[#2449C6] transition"
        >
          Reset
        </button>

        {canExport && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-[0_2px_8px_rgba(11,107,64,0.28)] bg-gradient-to-r from-[#0E7A4A] via-[#0B6B40] to-[#075633] text-white border border-[#075633] hover:brightness-110 active:scale-95 disabled:opacity-60 ${
                selectedCount > 0 ? 'ring-2 ring-emerald-300/50' : ''
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-100" />
              {exportingExcel ? 'Exporting…' : selectedCount > 0 ? `Export Excel (${selectedCount})` : 'Export Excel'}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf || (!pdfConfig?.rows?.length && !selectedCount)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-xs disabled:opacity-60 ${
                selectedCount > 0
                  ? 'bg-gradient-to-r from-[#2449C6] to-[#0B1B45] text-white ring-1 ring-white/20'
                  : 'border border-[#D5E3F7] bg-white text-slate-700 hover:bg-[#F5F8FF] hover:border-[#2449C6]/40 hover:text-[#2449C6]'
              }`}
            >
              <FileDown className="h-4 w-4 text-[#E8C985]" />
              {exportingPdf ? 'Exporting…' : selectedCount > 0 ? `Export PDF (${selectedCount})` : 'Export PDF'}
            </button>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-[#F5F8FF] px-4 py-2 text-sm font-semibold text-[#2449C6] border border-[#D5E3F7] shadow-xs">
          <span>✓ {selectedCount} row(s) selected for export</span>
          <button
            type="button"
            onClick={selection.clearSelection}
            className="text-slate-500 hover:text-rose-600 underline font-normal transition"
          >
            Clear selection
          </button>
        </div>
      )}

      {exportError && (
        <div className="text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 font-medium">
          {exportError}
        </div>
      )}
    </div>
  );
}

function useDateRange() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(monthStart);
  const [appliedTo, setAppliedTo] = useState(today);

  const applyFilters = () => { setAppliedFrom(from); setAppliedTo(to); };
  const resetFilters = () => { setFrom(monthStart); setTo(today); setAppliedFrom(monthStart); setAppliedTo(today); };

  return { from, to, setFrom, setTo, appliedFrom, appliedTo, applyFilters, resetFilters };
}

/** columns: [{key,label}]; totalKeys: subset of column keys to sum in a footer row. */
function GenericTable({ rows, columns, totalKeys, selection }) {
  const selectedCount = selection?.selectedCount || 0;

  const totals = useMemo(() => {
    if (!totalKeys?.length) return null;
    const calcRows = selectedCount > 0 ? selection.selectedRows : rows;
    const t = {};
    totalKeys.forEach((k) => { t[k] = calcRows.reduce((s, r) => s + (Number(r[k]) || 0), 0); });
    return t;
  }, [rows, totalKeys, selectedCount, selection?.selectedRows]);

  const firstKey = columns[0]?.key;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#D5E3F7] bg-white shadow-xs">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-left text-xs font-bold uppercase tracking-wider text-slate-600">
            {selection && (
              <th className="w-10 px-3.5 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={selection.isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = selection.isSomeSelected;
                  }}
                  onChange={selection.toggleSelectAll}
                  className="h-4 w-4 rounded-md border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6] cursor-pointer"
                  title="Select / Deselect all rows"
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3.5 py-2.5 ${totalKeys?.includes(c.key) ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EAF1FA]">
          {rows.map((r, i) => {
            const rowKey = selection?.getKey ? selection.getKey(r, i) : i;
            const isSelected = selection?.selectedKeys.has(rowKey);

            return (
              <tr
                key={rowKey}
                onClick={() => selection?.toggleSelectRow(rowKey)}
                className={`transition-colors cursor-pointer ${
                  isSelected ? 'bg-[#F5F8FF] font-semibold text-[#0B1B45]' : 'hover:bg-[#F8FAFD]'
                }`}
              >
                {selection && (
                  <td className="w-10 px-3.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => selection.toggleSelectRow(rowKey)}
                      className="h-4 w-4 rounded-md border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6] cursor-pointer"
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3.5 py-2.5 ${totalKeys?.includes(c.key) ? 'text-right font-bold text-[#2449C6]' : ''}`}>
                    {totalKeys?.includes(c.key) ? Number(r[c.key] ?? 0).toFixed(2) : (r[c.key] ?? '-')}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selection ? 1 : 0)} className="px-3.5 py-10 text-center text-slate-400">
                No data for this range.
              </td>
            </tr>
          )}
        </tbody>
        {totals && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-[#D5E3F7] bg-[#F5F8FF] font-bold text-[#0B1B45]">
              {selection && <td className="w-10 px-3.5 py-2.5"></td>}
              {columns.map((c) => (
                <td key={c.key} className={`whitespace-nowrap px-3.5 py-2.5 ${totalKeys.includes(c.key) ? 'text-right font-black text-[#2449C6]' : ''}`}>
                  {totalKeys.includes(c.key)
                    ? totals[c.key].toFixed(2)
                    : c.key === firstKey
                    ? selectedCount > 0
                      ? `Total (${selectedCount} selected)`
                      : 'Grand Total'
                    : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function GstRegisterPanel({ canExport }) {
  const { from, to, setFrom, setTo, appliedFrom, appliedTo, applyFilters, resetFilters } = useDateRange();
  const query = useQuery({ queryKey: ['report-gst', appliedFrom, appliedTo], queryFn: () => reportsApi.gstRegister({ from: appliedFrom, to: appliedTo }) });
  const rows = query.data || [];
  const selection = useTableSelection(rows, (r, i) => r.invoice_no || i);

  const columns = [
    { key: 'invoice_no', label: 'Invoice #' }, { key: 'invoice_date', label: 'Date' }, { key: 'customer_name', label: 'Customer' },
    { key: 'taxable_value', label: 'Taxable' }, { key: 'cgst_amount', label: 'CGST' }, { key: 'sgst_amount', label: 'SGST' },
    { key: 'grand_total', label: 'Grand Total' }, { key: 'payment_status', label: 'Status' },
  ];
  const totalKeys = ['taxable_value', 'cgst_amount', 'sgst_amount', 'grand_total'];
  return (
    <div>
      <DateRangeBar
        from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={applyFilters} onReset={resetFilters} canExport={canExport}
        selection={selection}
        onExport={() => reportsApi.downloadExport('gst-register', { from: appliedFrom, to: appliedTo })}
        pdfConfig={{
          title: 'GST Sales Register', filtersText: `From ${appliedFrom} to ${appliedTo}`,
          columns: Object.fromEntries(columns.map((c) => [c.key, c.label])), rows,
          totalsRow: Object.fromEntries(totalKeys.map((k) => [k, rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)])),
          filename: `gst_register_${appliedFrom}_${appliedTo}.pdf`,
        }}
      />
      <GenericTable rows={rows} columns={columns} totalKeys={totalKeys} selection={selection} />
    </div>
  );
}

function NonGstRegisterPanel({ canExport }) {
  const { from, to, setFrom, setTo, appliedFrom, appliedTo, applyFilters, resetFilters } = useDateRange();
  const query = useQuery({ queryKey: ['report-non-gst', appliedFrom, appliedTo], queryFn: () => reportsApi.nonGstRegister({ from: appliedFrom, to: appliedTo }) });
  const rows = query.data || [];
  const selection = useTableSelection(rows, (r, i) => r.invoice_no || i);

  const columns = [
    { key: 'invoice_no', label: 'Estimate #' }, { key: 'invoice_date', label: 'Date' }, { key: 'customer_name', label: 'Customer' },
    { key: 'grand_total', label: 'Grand Total' }, { key: 'payment_status', label: 'Status' },
  ];
  const totalKeys = ['grand_total'];
  return (
    <div>
      <DateRangeBar
        from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={applyFilters} onReset={resetFilters} canExport={canExport}
        selection={selection}
        onExport={() => reportsApi.downloadExport('non-gst-register', { from: appliedFrom, to: appliedTo })}
        pdfConfig={{
          title: 'Non-GST Register', filtersText: `From ${appliedFrom} to ${appliedTo}`,
          columns: Object.fromEntries(columns.map((c) => [c.key, c.label])), rows,
          totalsRow: { grand_total: rows.reduce((s, r) => s + (Number(r.grand_total) || 0), 0) },
          filename: `non_gst_register_${appliedFrom}_${appliedTo}.pdf`,
        }}
      />
      <GenericTable rows={rows} columns={columns} totalKeys={totalKeys} selection={selection} />
    </div>
  );
}

function PurchaseRegisterPanel({ canExport, canViewCost }) {
  const { from, to, setFrom, setTo, appliedFrom, appliedTo, applyFilters, resetFilters } = useDateRange();
  const query = useQuery({ queryKey: ['report-purchases', appliedFrom, appliedTo], queryFn: () => reportsApi.purchaseRegister({ from: appliedFrom, to: appliedTo }) });
  const rows = query.data || [];
  const selection = useTableSelection(rows, (r, i) => r.grn_no || i);

  const columns = [
    { key: 'grn_no', label: 'GRN #' }, { key: 'purchase_date', label: 'Date' }, { key: 'supplier_name', label: 'Supplier' },
    ...(canViewCost ? [{ key: 'grand_total', label: 'Grand Total' }, { key: 'paid_amount', label: 'Paid' }, { key: 'pending_balance', label: 'Pending' }] : []),
    { key: 'status', label: 'Status' },
  ];
  const totalKeys = canViewCost ? ['grand_total', 'paid_amount', 'pending_balance'] : [];
  return (
    <div>
      <DateRangeBar
        from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={applyFilters} onReset={resetFilters} canExport={canExport}
        selection={selection}
        onExport={() => reportsApi.downloadExport('purchase-register', { from: appliedFrom, to: appliedTo })}
        pdfConfig={{
          title: 'Purchase Register', filtersText: `From ${appliedFrom} to ${appliedTo}`,
          columns: Object.fromEntries(columns.map((c) => [c.key, c.label])), rows,
          totalsRow: Object.fromEntries(totalKeys.map((k) => [k, rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)])),
          filename: `purchase_register_${appliedFrom}_${appliedTo}.pdf`,
        }}
      />
      <GenericTable rows={rows} columns={columns} totalKeys={totalKeys} selection={selection} />
    </div>
  );
}

const SALES_REPORTS = [
  {
    key: 'branch', label: 'Branch Wise', apiPath: 'branch-wise-sales', fetch: reportsApi.branchWiseSales, rowKey: 'branch_name',
    columns: { branch_name: 'Branch', total_bills: 'Bills', total_items: 'Items', quantity: 'Qty', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales', paid_amount: 'Paid', credit_amount: 'Credit' },
  },
  {
    key: 'route', label: 'Route Wise', apiPath: 'route-wise-sales', fetch: reportsApi.routeWiseSales, rowKey: 'route_name',
    columns: { route_name: 'Route', total_bills: 'Bills', customers: 'Customers', quantity: 'Qty', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales', paid_amount: 'Paid', credit_amount: 'Credit' },
  },
  {
    key: 'customer', label: 'Customer Wise', apiPath: 'customer-wise-sales', fetch: reportsApi.customerWiseSales, rowKey: 'customer_code',
    columns: { customer_code: 'Code', customer_name: 'Customer', branch_name: 'Branch', route_name: 'Route', bills: 'Bills', items: 'Items', quantity: 'Qty', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales', paid_amount: 'Paid', credit_amount: 'Credit' },
    searchable: ['customer_name', 'route_name', 'branch_name'],
  },
  {
    key: 'supplier', label: 'Supplier Wise', apiPath: 'supplier-wise-sales', fetch: reportsApi.supplierWiseSales, rowKey: 'supplier_name',
    columns: { supplier_name: 'Supplier', items_sold: 'Items Sold', quantity: 'Qty', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'brand', label: 'Brand Wise', apiPath: 'brand-wise-sales', fetch: reportsApi.brandWiseSales, rowKey: 'brand_name',
    columns: { brand_name: 'Brand', items_sold: 'Items Sold', quantity: 'Qty', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'category', label: 'Category Wise', apiPath: 'category-wise-sales', fetch: reportsApi.categoryWiseSales, rowKey: 'category_name',
    columns: { category_name: 'Category', items_sold: 'Items Sold', quantity: 'Qty', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'brand_category', label: 'Brand & Category', apiPath: 'brand-category-wise-sales', rowKey: '_key',
    fetch: async (params) => (await reportsApi.brandCategoryWiseSales(params)).map((r) => ({ ...r, _key: `${r.brand_name}__${r.category_name}` })),
    columns: { brand_name: 'Brand', category_name: 'Category', items_sold: 'Items Sold', quantity: 'Qty', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'item', label: 'Item Wise', apiPath: 'item-wise-sales', fetch: reportsApi.itemWiseSales, rowKey: 'item_code',
    columns: { item_name: 'Item', item_code: 'SKU', barcode: 'Barcode', brand_name: 'Brand', category_name: 'Category', supplier_name: 'Supplier', quantity: 'Qty Sold', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
    searchable: ['item_name', 'item_code', 'barcode'],
  },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function sumColumn(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function SalesWiseReportPanel({ report, canExport }) {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [appliedFrom, setAppliedFrom] = useState(todayStr());
  const [appliedTo, setAppliedTo] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const query = useQuery({
    queryKey: ['sales-report', report.key, appliedFrom, appliedTo],
    queryFn: () => report.fetch({ from: appliedFrom, to: appliedTo }),
  });
  const rows = useMemo(() => query.data || [], [query.data]);
  const filteredRows = useMemo(() => {
    if (!report.searchable || !search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => report.searchable.some((k) => String(r[k] || '').toLowerCase().includes(q)));
  }, [rows, search, report.searchable]);

  const selection = useTableSelection(filteredRows, (r, i) => r[report.rowKey] || i);
  const selectedCount = selection.selectedCount;

  const numericKeys = useMemo(() => Object.keys(report.columns).filter((k) => NUMERIC_REPORT_KEYS.has(k)), [report.columns]);
  const firstTextKey = useMemo(() => Object.keys(report.columns).find((k) => !NUMERIC_REPORT_KEYS.has(k)), [report.columns]);

  const totals = useMemo(() => {
    const calcRows = selectedCount > 0 ? selection.selectedRows : filteredRows;
    const t = {};
    numericKeys.forEach((k) => { t[k] = sumColumn(calcRows, k); });
    return t;
  }, [filteredRows, numericKeys, selectedCount, selection.selectedRows]);

  const filtersText = `From ${appliedFrom} to ${appliedTo}`;
  const applyFilters = () => { setAppliedFrom(from); setAppliedTo(to); };
  const resetFilters = () => { setFrom(todayStr()); setTo(todayStr()); setAppliedFrom(todayStr()); setAppliedTo(todayStr()); setSearch(''); };

  const handleExportExcel = async () => {
    setExportError('');
    setExportingExcel(true);
    try {
      if (selectedCount > 0) {
        downloadReportExcel({
          title: `${report.label} Sales`,
          columns: report.columns,
          rows: selection.selectedRows,
          totalsRow: totals,
          filename: `${report.apiPath}_${appliedFrom}_${appliedTo}.csv`,
        });
      } else {
        await reportsApi.downloadExport(report.apiPath, { from: appliedFrom, to: appliedTo });
      }
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    setExportError('');
    setExportingPdf(true);
    try {
      const rowsToExport = selectedCount > 0 ? selection.selectedRows : filteredRows;
      downloadReportPdf({
        title: `${report.label} Sales`,
        filtersText: `${filtersText}${selectedCount > 0 ? ` (${selectedCount} selected)` : ''}`,
        columns: report.columns,
        rows: rowsToExport,
        totalsRow: totals,
        filename: `${report.apiPath}_${appliedFrom}_${appliedTo}.pdf`,
      });
    } catch (err) {
      setExportError(err?.message || 'Unable to generate the PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
            />
          </div>
          <Button size="sm" onClick={applyFilters} className="shadow-xs">
            Apply Filter
          </Button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-[#F5F8FF] hover:text-[#2449C6] transition"
          >
            Reset
          </button>

          {report.searchable && (
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3.5 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
            />
          )}

          {canExport && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-[0_2px_8px_rgba(11,107,64,0.28)] bg-gradient-to-r from-[#0E7A4A] via-[#0B6B40] to-[#075633] text-white border border-[#075633] hover:brightness-110 active:scale-95 disabled:opacity-60 ${
                  selectedCount > 0 ? 'ring-2 ring-emerald-300/50' : ''
                }`}
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-100" />
                {exportingExcel ? 'Exporting…' : selectedCount > 0 ? `Export Excel (${selectedCount})` : 'Export Excel'}
              </button>
              <button
                onClick={handleExportPdf}
                disabled={exportingPdf || filteredRows.length === 0}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-xs disabled:opacity-60 ${
                  selectedCount > 0
                    ? 'bg-gradient-to-r from-[#2449C6] to-[#0B1B45] text-white ring-1 ring-white/20'
                    : 'border border-[#D5E3F7] bg-white text-slate-700 hover:bg-[#F5F8FF] hover:border-[#2449C6]/40 hover:text-[#2449C6]'
                }`}
              >
                <FileDown className="h-4 w-4 text-[#E8C985]" />
                {exportingPdf ? 'Exporting…' : selectedCount > 0 ? `Export PDF (${selectedCount})` : 'Export PDF'}
              </button>
            </div>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-[#F5F8FF] px-4 py-2 text-sm font-semibold text-[#2449C6] border border-[#D5E3F7] shadow-xs">
            <span>✓ {selectedCount} row(s) selected for export</span>
            <button
              type="button"
              onClick={selection.clearSelection}
              className="text-slate-500 hover:text-rose-600 underline font-normal transition"
            >
              Clear selection
            </button>
          </div>
        )}

        {exportError && (
          <div className="text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 font-medium">
            {exportError}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#D5E3F7] bg-white shadow-xs">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-left text-xs font-bold uppercase tracking-wider text-slate-600">
              <th className="w-10 px-3.5 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={selection.isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = selection.isSomeSelected; }}
                  onChange={selection.toggleSelectAll}
                  className="h-4 w-4 rounded-md border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6] cursor-pointer"
                  title="Select / Deselect all rows"
                />
              </th>
              {Object.entries(report.columns).map(([k, label]) => (
                <th key={k} className={`whitespace-nowrap px-3.5 py-2.5 ${NUMERIC_REPORT_KEYS.has(k) ? 'text-right' : ''}`}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAF1FA]">
            {query.isLoading && (
              <tr><td colSpan={Object.keys(report.columns).length + 1} className="px-3.5 py-10 text-center text-slate-400">Loading report data…</td></tr>
            )}
            {query.isError && (
              <tr><td colSpan={Object.keys(report.columns).length + 1} className="px-3.5 py-10 text-center text-rose-600">{query.error?.response?.data?.error || 'Failed to load this report.'}</td></tr>
            )}
            {!query.isLoading && !query.isError && filteredRows.map((r, i) => {
              const rowKey = selection.getKey(r, i);
              const isSelected = selection.selectedKeys.has(rowKey);

              return (
                <tr
                  key={rowKey}
                  onClick={() => selection.toggleSelectRow(rowKey)}
                  className={`transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#F5F8FF] font-semibold text-[#0B1B45]' : 'hover:bg-[#F8FAFD]'
                  }`}
                >
                  <td className="w-10 px-3.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => selection.toggleSelectRow(rowKey)}
                      className="h-4 w-4 rounded-md border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6] cursor-pointer"
                    />
                  </td>
                  {Object.keys(report.columns).map((k) => (
                    <td key={k} className={`whitespace-nowrap px-3.5 py-2.5 ${NUMERIC_REPORT_KEYS.has(k) ? 'text-right font-bold text-[#2449C6]' : ''}`}>
                      {NUMERIC_REPORT_KEYS.has(k) ? Number(r[k] ?? 0).toFixed(2) : (r[k] ?? '-')}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!query.isLoading && !query.isError && filteredRows.length === 0 && (
              <tr><td colSpan={Object.keys(report.columns).length + 1} className="px-3.5 py-10 text-center text-slate-400">No data for this range.</td></tr>
            )}
          </tbody>
          {!query.isLoading && !query.isError && filteredRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[#D5E3F7] bg-[#F5F8FF] font-bold text-[#0B1B45]">
                <td className="w-10 px-3.5 py-2.5"></td>
                {Object.keys(report.columns).map((k) => (
                  <td key={k} className={`whitespace-nowrap px-3.5 py-2.5 ${NUMERIC_REPORT_KEYS.has(k) ? 'text-right font-black text-[#2449C6]' : ''}`}>
                    {NUMERIC_REPORT_KEYS.has(k)
                      ? totals[k].toFixed(2)
                      : k === firstTextKey
                      ? selectedCount > 0
                        ? `Total (${selectedCount} selected)`
                        : 'Grand Total'
                      : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function SalesReportsSection({ canExport }) {
  const [active, setActive] = useState(SALES_REPORTS[0].key);
  return (
    <Tabs
      activeKey={active}
      onTabChange={setActive}
      tabs={SALES_REPORTS.map((r) => ({ key: r.key, label: r.label, content: <SalesWiseReportPanel report={r} canExport={canExport} /> }))}
    />
  );
}

function SnapshotExportBar({ canExport, onExport, pdfConfig, excelConfig, selection }) {
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState('');

  if (!canExport) return null;

  const selectedCount = selection?.selectedCount || 0;

  const handleExportExcel = async () => {
    setExportError('');
    setExportingExcel(true);
    try {
      if (selectedCount > 0 && selection?.selectedRows) {
        const cols = excelConfig?.columns || pdfConfig?.columns;
        const filename = excelConfig?.filename || pdfConfig?.filename?.replace('.pdf', '.csv') || 'report.csv';
        const title = excelConfig?.title || pdfConfig?.title || 'Report';
        downloadReportExcel({
          title,
          columns: cols,
          rows: selection.selectedRows,
          totalsRow: excelConfig?.totalsRow || pdfConfig?.totalsRow,
          filename,
        });
      } else {
        await onExport();
      }
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    setExportError('');
    setExportingPdf(true);
    try {
      if (selectedCount > 0 && selection?.selectedRows && pdfConfig) {
        const rowsToExport = selection.selectedRows;
        let selectedTotalsRow = pdfConfig.totalsRow;
        if (selectedTotalsRow) {
          const totalKeys = Object.keys(selectedTotalsRow);
          selectedTotalsRow = Object.fromEntries(
            totalKeys.map((k) => [k, rowsToExport.reduce((s, r) => s + (Number(r[k]) || 0), 0)])
          );
        }
        downloadReportPdf({
          ...pdfConfig,
          rows: rowsToExport,
          totalsRow: selectedTotalsRow,
          filtersText: `${pdfConfig.filtersText || ''} (${selectedCount} selected)`,
        });
      } else {
        downloadReportPdf(pdfConfig);
      }
    } catch (err) {
      setExportError(err?.message || 'Unable to generate the PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      <div className="flex justify-end gap-2">
        <button
          onClick={handleExportExcel}
          disabled={exportingExcel}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-[0_2px_8px_rgba(11,107,64,0.28)] bg-gradient-to-r from-[#0E7A4A] via-[#0B6B40] to-[#075633] text-white border border-[#075633] hover:brightness-110 active:scale-95 disabled:opacity-60 ${
            selectedCount > 0 ? 'ring-2 ring-emerald-300/50' : ''
          }`}
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-100" />
          {exportingExcel ? 'Exporting…' : selectedCount > 0 ? `Export Excel (${selectedCount})` : 'Export Excel'}
        </button>
        <button
          onClick={handleExportPdf}
          disabled={exportingPdf || (!pdfConfig?.rows?.length && !selectedCount)}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-xs disabled:opacity-60 ${
            selectedCount > 0
              ? 'bg-gradient-to-r from-[#2449C6] to-[#0B1B45] text-white ring-1 ring-white/20'
              : 'border border-[#D5E3F7] bg-white text-slate-700 hover:bg-[#F5F8FF] hover:border-[#2449C6]/40 hover:text-[#2449C6]'
          }`}
        >
          <FileDown className="h-4 w-4 text-[#E8C985]" />
          {exportingPdf ? 'Exporting…' : selectedCount > 0 ? `Export PDF (${selectedCount})` : 'Export PDF'}
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-[#F5F8FF] px-4 py-2 text-sm font-semibold text-[#2449C6] border border-[#D5E3F7] shadow-xs">
          <span>✓ {selectedCount} row(s) selected for export</span>
          <button
            type="button"
            onClick={selection.clearSelection}
            className="text-slate-500 hover:text-rose-600 underline font-normal transition"
          >
            Clear selection
          </button>
        </div>
      )}

      {exportError && (
        <div className="text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 font-medium">
          {exportError}
        </div>
      )}
    </div>
  );
}

function CreditOutstandingPanel({ canExport }) {
  const query = useQuery({ queryKey: ['report-credit-outstanding'], queryFn: reportsApi.creditOutstanding });
  const rows = query.data || [];
  const selection = useTableSelection(rows, (r, i) => r.customer_name || i);

  const columns = [
    { key: 'customer_name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'credit_limit', label: 'Credit Limit' },
    { key: 'total_outstanding', label: 'Outstanding' }, { key: 'days_overdue', label: 'Days Overdue' }, { key: 'over_limit', label: 'Over Limit?' },
  ];
  return (
    <div>
      <SnapshotExportBar
        canExport={canExport}
        selection={selection}
        onExport={() => reportsApi.downloadExport('credit-outstanding', {})}
        pdfConfig={{
          title: 'Credit Outstanding', filtersText: 'Current outstanding balances',
          columns: Object.fromEntries(columns.map((c) => [c.key, c.label])), rows,
          totalsRow: { total_outstanding: rows.reduce((s, r) => s + (Number(r.total_outstanding) || 0), 0) },
          filename: 'credit_outstanding.pdf',
        }}
      />
      <GenericTable rows={rows} columns={columns} totalKeys={['total_outstanding']} selection={selection} />
    </div>
  );
}

function ExpenseIncomePanel({ canExport }) {
  const { from, to, setFrom, setTo, appliedFrom, appliedTo, applyFilters, resetFilters } = useDateRange();
  const query = useQuery({ queryKey: ['report-expense-income', appliedFrom, appliedTo], queryFn: () => reportsApi.expenseIncome({ from: appliedFrom, to: appliedTo }) });
  const rows = query.data || [];
  const selection = useTableSelection(rows, (r, i) => r.ref_no || i);

  const columns = [
    { key: 'type', label: 'Type' }, { key: 'ref_no', label: 'Reference #' }, { key: 'category', label: 'Category' },
    { key: 'amount', label: 'Amount' }, { key: 'description', label: 'Description' }, { key: 'ref_date', label: 'Date' },
  ];
  return (
    <div>
      <DateRangeBar
        from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={applyFilters} onReset={resetFilters} canExport={canExport}
        selection={selection}
        onExport={() => reportsApi.downloadExport('expense-income', { from: appliedFrom, to: appliedTo })}
        pdfConfig={{
          title: 'Expense & Income', filtersText: `From ${appliedFrom} to ${appliedTo}`,
          columns: Object.fromEntries(columns.map((c) => [c.key, c.label])), rows,
          totalsRow: { amount: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) },
          filename: `expense_income_${appliedFrom}_${appliedTo}.pdf`,
        }}
      />
      <GenericTable rows={rows} columns={columns} totalKeys={['amount']} selection={selection} />
    </div>
  );
}

const INVOICE_WISE_PROFIT_REPORT = {
  key: 'profit_invoice_wise', label: 'Invoice-wise Profit/Loss', apiPath: 'profit/invoice-wise',
  fetch: reportsApi.profitInvoiceWise, rowKey: '_key',
  columns: {
    invoice_no: 'Invoice #', invoice_date: 'Date', customer_name: 'Customer', item_name: 'Item', qty: 'Qty',
    cost_price: 'Cost Price', cost_amount: 'Cost Amount', selling_price: 'Selling Price', gross_amount: 'Gross Amount',
    discount: 'Discount', gst: 'GST', net_amount: 'Net Amount',
    invoice_paid_amount: 'Paid Amount', invoice_credit_amount: 'Credit Amount', profit_loss: 'Profit / Loss',
  },
  searchable: ['invoice_no', 'customer_name', 'item_name'],
};

/**
 * Two modes in one Profits section (section 5 of the reporting
 * requirements): "Date-wise / Summary" is the existing revenue/COGS/expense
 * roll-up; "Invoice-wise" reuses SalesWiseReportPanel — the exact same
 * generic table/search/export machinery every other sales-by-X report
 * already uses — against the new /reports/profit/invoice-wise endpoint,
 * rather than a bespoke table component.
 */
function ProfitPanel({ canExport }) {
  const [mode, setMode] = useState('summary'); // 'summary' | 'invoice_wise'
  return (
    <div>
      <div className="mb-4 flex gap-1.5 rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD] p-1.5 w-fit shadow-xs">
        {[['summary', 'Date-wise / Summary'], ['invoice_wise', 'Invoice-wise Profit/Loss']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              mode === key
                ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-md shadow-[#0B1B45]/20 ring-1 ring-white/20'
                : 'text-slate-600 hover:text-[#0B1B45] hover:bg-white/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'summary'
        ? <ProfitSummaryPanel canExport={canExport} />
        : <SalesWiseReportPanel report={INVOICE_WISE_PROFIT_REPORT} canExport={canExport} />}
    </div>
  );
}

function ProfitSummaryPanel({ canExport }) {
  const { from, to, setFrom, setTo, appliedFrom, appliedTo, applyFilters, resetFilters } = useDateRange();
  const query = useQuery({ queryKey: ['report-profit', appliedFrom, appliedTo], queryFn: () => reportsApi.profit({ from: appliedFrom, to: appliedTo }) });
  const p = query.data;
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportError, setExportError] = useState('');

  const profitColumns = { revenue: 'Revenue (ex-tax)', cogs: 'COGS', gross_profit: 'Gross Profit', expenses: 'Expenses', net_profit: 'Net Profit' };

  const handleExportExcel = async () => {
    setExportError('');
    setExportingExcel(true);
    try {
      await reportsApi.downloadExport('profit', { from: appliedFrom, to: appliedTo });
    } catch (err) {
      setExportError(err?.response?.data?.error || err?.message || 'Unable to generate the Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    setExportError('');
    try {
      downloadReportPdf({
        title: 'Profit (P&L)', filtersText: `From ${appliedFrom} to ${appliedTo}`,
        columns: profitColumns, rows: p ? [p] : [],
        filename: `profit_${appliedFrom}_${appliedTo}.pdf`,
      });
    } catch (err) {
      setExportError(err?.message || 'Unable to generate the PDF. Please try again.');
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2.5">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-36 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
          />
        </div>
        <Button size="sm" onClick={applyFilters} className="shadow-xs">Apply Filter</Button>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-[#F5F8FF] hover:text-[#2449C6] transition"
        >
          Reset
        </button>
        {canExport && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0E7A4A] via-[#0B6B40] to-[#075633] text-white border border-[#075633] px-3.5 py-1.5 text-sm font-bold shadow-[0_2px_8px_rgba(11,107,64,0.28)] hover:brightness-110 active:scale-95 disabled:opacity-60 transition"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-100" />
              {exportingExcel ? 'Exporting…' : 'Export Excel'}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={!p}
              className="flex items-center gap-1.5 rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-1.5 text-sm font-bold text-slate-700 shadow-xs hover:border-[#2449C6]/40 hover:bg-[#F5F8FF] hover:text-[#2449C6] disabled:opacity-60 transition"
            >
              <FileDown className="h-4 w-4 text-[#E8C985]" />
              Export PDF
            </button>
          </div>
        )}
      </div>
      {exportError && (
        <div className="mb-4 text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 font-medium">
          {exportError}
        </div>
      )}
      {p && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            ['Revenue (ex-tax)', p.revenue], ['COGS', p.cogs], ['Gross Profit', p.gross_profit],
            ['Expenses', p.expenses], ['Net Profit', p.net_profit],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[#D5E3F7] bg-white p-5 shadow-xs hover:border-[#2449C6]/30 transition">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
              <div className={`mt-2 text-2xl font-black ${Number(value) < 0 ? 'text-rose-600' : 'text-[#0B1B45]'}`}>₹{Number(value).toFixed(2)}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">
        COGS uses each item's current cost price (invoices don't snapshot cost at sale time) — see README assumptions.
      </p>
    </div>
  );
}

function LowStockPanel({ canExport }) {
  const query = useQuery({ queryKey: ['report-low-stock'], queryFn: reportsApi.lowStock });
  const rows = query.data || [];
  const selection = useTableSelection(rows, (r, i) => r.item_code || i);

  const columns = [
    { key: 'item_code', label: 'Code' }, { key: 'item_name', label: 'Item' },
    { key: 'branch_qty', label: 'Qty on hand' }, { key: 'min_stock_threshold', label: 'Min threshold' },
  ];
  return (
    <div>
      <SnapshotExportBar
        canExport={canExport}
        selection={selection}
        onExport={() => reportsApi.downloadExport('/stock-hub/low-stock', {})}
        pdfConfig={{
          title: 'Low Stock', filtersText: 'Current stock levels',
          columns: Object.fromEntries(columns.map((c) => [c.key, c.label])), rows,
          filename: 'low_stock.pdf',
        }}
      />
      <GenericTable rows={rows} columns={columns} selection={selection} />
    </div>
  );
}

function PricingPanel({ type, label, canExport }) {
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState({}); // item_id -> raw input string
  const [message, setMessage] = useState(null); // { kind: 'success' | 'error', text }
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ['pricing', type, search], queryFn: () => pricingApi.list(type, search) });
  const saveMutation = useMutation({ mutationFn: (items) => pricingApi.bulkSave(type, items) });

  const rows = query.data || [];
  const selection = useTableSelection(rows, (r) => r.id);
  const selectedCount = selection.selectedCount;

  const changedIds = Object.keys(edits);

  const handleChange = (itemId, value) => {
    setMessage(null);
    setEdits((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleSave = async () => {
    setMessage(null);
    const items = changedIds
      .map((id) => ({ item_id: Number(id), price: edits[id] === '' ? null : Number(edits[id]) }))
      .filter((row) => row.price !== null);

    if (items.length === 0) return;
    const invalid = items.find((row) => Number.isNaN(row.price) || row.price < 0);
    if (invalid) {
      setMessage({ kind: 'error', text: `${label} price must be a non-negative number.` });
      return;
    }

    try {
      const result = await saveMutation.mutateAsync(items);
      setMessage({ kind: 'success', text: `Saved ${result.updated} ${label.toLowerCase()} price${result.updated === 1 ? '' : 's'}.` });
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['pricing', type] });
    } catch (err) {
      setMessage({ kind: 'error', text: err?.response?.data?.error || 'Save failed' });
    }
  };

  const columns = {
    item_name: 'Item',
    item_code: 'Code',
    unit_code: 'Unit',
    mrp: 'MRP',
    net_srate: 'Normal NET_SRATE',
    price: `${label} Price`,
  };

  const handleExportExcel = () => {
    const rowsToExport = (selectedCount > 0 ? selection.selectedRows : rows).map((r) => ({
      ...r,
      price: edits[r.id] !== undefined ? edits[r.id] : (r.price ?? 'Not set'),
    }));
    downloadReportExcel({
      title: `${label} Pricing List`,
      columns,
      rows: rowsToExport,
      filename: `${type}_pricing_list.csv`,
    });
  };

  const handleExportPdf = () => {
    const rowsToExport = (selectedCount > 0 ? selection.selectedRows : rows).map((r) => ({
      ...r,
      price: edits[r.id] !== undefined ? edits[r.id] : (r.price ?? 'Not set'),
    }));
    downloadReportPdf({
      title: `${label} Pricing List`,
      filtersText: `Tier: ${label}${selectedCount > 0 ? ` (${selectedCount} selected)` : ''}`,
      columns,
      rows: rowsToExport,
      filename: `${type}_pricing_list.pdf`,
    });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          placeholder="Search item name / code / barcode"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] px-3.5 py-1.5 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
        />
        <Button size="sm" onClick={handleSave} disabled={changedIds.length === 0 || saveMutation.isPending} className="shadow-xs">
          {saveMutation.isPending ? 'Saving…' : `Save${changedIds.length ? ` (${changedIds.length})` : ''}`}
        </Button>
        {changedIds.length > 0 && (
          <button
            type="button"
            onClick={() => { setEdits({}); setMessage(null); }}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-[#F5F8FF] hover:text-[#2449C6] transition"
          >
            Reset
          </button>
        )}

        {canExport && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={rows.length === 0}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-[0_2px_8px_rgba(11,107,64,0.28)] bg-gradient-to-r from-[#0E7A4A] via-[#0B6B40] to-[#075633] text-white border border-[#075633] hover:brightness-110 active:scale-95 disabled:opacity-60 ${
                selectedCount > 0 ? 'ring-2 ring-emerald-300/50' : ''
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-100" />
              {selectedCount > 0 ? `Export Excel (${selectedCount})` : 'Export Excel'}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={rows.length === 0}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all shadow-xs disabled:opacity-60 ${
                selectedCount > 0
                  ? 'bg-gradient-to-r from-[#2449C6] to-[#0B1B45] text-white ring-1 ring-white/20'
                  : 'border border-[#D5E3F7] bg-white text-slate-700 hover:bg-[#F5F8FF] hover:border-[#2449C6]/40 hover:text-[#2449C6]'
              }`}
            >
              <FileDown className="h-4 w-4 text-[#E8C985]" />
              {selectedCount > 0 ? `Export PDF (${selectedCount})` : 'Export PDF'}
            </button>
          </div>
        )}

        {message && (
          <span className={`text-xs font-semibold px-3 py-1 rounded-xl ${message.kind === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
            {message.text}
          </span>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-[#F5F8FF] px-4 py-2 text-sm font-semibold text-[#2449C6] border border-[#D5E3F7] shadow-xs">
          <span>✓ {selectedCount} row(s) selected for export</span>
          <button
            type="button"
            onClick={selection.clearSelection}
            className="text-slate-500 hover:text-rose-600 underline font-normal transition"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[#D5E3F7] bg-white shadow-xs">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-left text-xs font-bold uppercase tracking-wider text-slate-600">
              <th className="w-10 px-3.5 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={selection.isAllSelected}
                  ref={(el) => { if (el) el.indeterminate = selection.isSomeSelected; }}
                  onChange={selection.toggleSelectAll}
                  className="h-4 w-4 rounded-md border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6] cursor-pointer"
                  title="Select / Deselect all rows"
                />
              </th>
              <th className="px-3.5 py-2.5">Item</th>
              <th className="px-3.5 py-2.5">Unit</th>
              <th className="px-3.5 py-2.5 text-right">MRP</th>
              <th className="px-3.5 py-2.5 text-right">Normal NET_SRATE</th>
              <th className="px-3.5 py-2.5 text-right">{label} Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAF1FA]">
            {query.isLoading && (
              <tr><td colSpan={6} className="px-3.5 py-10 text-center text-slate-400">Loading items…</td></tr>
            )}
            {!query.isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3.5 py-10 text-center text-slate-400">No items found.</td></tr>
            )}
            {!query.isLoading && rows.map((r) => {
              const edited = Object.prototype.hasOwnProperty.call(edits, r.id);
              const value = edited ? edits[r.id] : (r.price ?? '');
              const isSelected = selection.selectedKeys.has(r.id);

              return (
                <tr
                  key={r.id}
                  onClick={() => selection.toggleSelectRow(r.id)}
                  className={`transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#F5F8FF] font-semibold text-[#0B1B45]' : edited ? 'bg-amber-50/70' : 'hover:bg-[#F8FAFD]'
                  }`}
                >
                  <td className="w-10 px-3.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => selection.toggleSelectRow(r.id)}
                      className="h-4 w-4 rounded-md border-[#D5E3F7] text-[#2449C6] focus:ring-[#2449C6] cursor-pointer"
                    />
                  </td>
                  <td className="px-3.5 py-2.5 font-semibold text-[#0B1B45]">
                    {r.item_name} <span className="font-normal text-slate-400">({r.item_code})</span>
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-500">{r.unit_code || '—'}</td>
                  <td className="px-3.5 py-2.5 text-right text-slate-700 font-bold whitespace-nowrap">₹{Number(r.mrp || 0).toFixed(2)}</td>
                  <td className="px-3.5 py-2.5 text-right text-slate-700 font-bold whitespace-nowrap">₹{Number(r.net_srate || 0).toFixed(2)}</td>
                  <td className="px-3.5 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={value}
                      placeholder="Not set"
                      onChange={(e) => handleChange(r.id, e.target.value)}
                      className="w-28 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-sm text-right font-bold text-[#0B1B45] transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Reports() {
  const canExport = usePermission('reports.export_excel');
  const canViewCost = usePermission('purchases.view_purchase_cost');
  const canGst = usePermission('reports.view_gst_register');
  const canNonGst = usePermission('reports.view_non_gst_register');
  const canAll = usePermission('reports.view_all');
  const canCredit = usePermission('credit.view_shopwide_outstanding');
  const canProfit = usePermission('reports.view_profit');
  const canManagePricing = usePermission('catalog.manage_items');
  const canViewFinancials = usePermission('dashboard.view_financial_summary');
  const [showTotalsReport, setShowTotalsReport] = useState(false);

  const tabs = [];
  if (canViewFinancials || canAll || canProfit) {
    tabs.push({
      key: 'financial-summary',
      label: 'Financial Summary',
      content: <FinancialSummaryReport canExport={canExport} canViewCost={canViewCost} canProfit={canProfit} />,
    });
  }
  if (canGst) tabs.push({ key: 'gst', label: 'GST Sales Register', content: <GstRegisterPanel canExport={canExport} /> });
  if (canAll) tabs.push({ key: 'purchases', label: 'Purchase Register', content: <PurchaseRegisterPanel canExport={canExport} canViewCost={canViewCost} /> });
  if (canAll) tabs.push({ key: 'sales-reports', label: 'Sales Reports', content: <SalesReportsSection canExport={canExport} /> });
  if (canManagePricing) tabs.push({ key: 'retail-price', label: 'Retail Price', content: <PricingPanel type="retail" label="Retail" canExport={canExport} /> });
  if (canManagePricing) tabs.push({ key: 'wholesale-price', label: 'Wholesale Price', content: <PricingPanel type="wholesale" label="Wholesale" canExport={canExport} /> });
  if (canCredit) tabs.push({ key: 'credit', label: 'Credit Outstanding', content: <CreditOutstandingPanel canExport={canExport} /> });
  if (canAll) tabs.push({ key: 'expense-income', label: 'Expense & Income', content: <ExpenseIncomePanel canExport={canExport} /> });
  if (canProfit) tabs.push({ key: 'profit', label: 'Profit (P&L)', content: <ProfitPanel canExport={canExport} /> });
  if (canAll) tabs.push({ key: 'low-stock', label: 'Low Stock', content: <LowStockPanel canExport={canExport} /> });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-md shadow-[#0B1B45]/20 ring-1 ring-white/20">
            <FileSpreadsheet className="w-5 h-5 text-[#E8C985]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#0B1B45]">
              Business Reports
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              GST registers, purchases, sales breakdowns, outstanding balances, and P&L financial analysis
            </p>
          </div>
        </div>

        {(canViewFinancials || canAll) && (
          <button
            onClick={() => setShowTotalsReport(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3.5 py-2 text-xs font-bold text-[#0B1B45] shadow-2xs hover:bg-[#EDF5FF] hover:border-[#2449C6] transition-all active:scale-95 shrink-0"
          >
            <PieChart size={14} className="text-[#2449C6]" />
            <span>Totals Report</span>
          </button>
        )}
      </div>

      {tabs.length === 0 ? (
        <div className="rounded-2xl border border-[#D5E3F7] bg-white p-8 text-center text-slate-400 text-xs">
          You don't have access to any reports.
        </div>
      ) : (
        <Tabs tabs={tabs} />
      )}

      {(canViewFinancials || canAll) && (
        <TotalsReportModal
          isOpen={showTotalsReport}
          onClose={() => setShowTotalsReport(false)}
        />
      )}
    </div>
  );
}
