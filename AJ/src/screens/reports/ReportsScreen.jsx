import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, TextInput, Alert, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '../../api/admin';
import { friendlyErrorMessage } from '../../api/client';
import { Icon } from '../../components/Icon';
import { downloadAndShareFile, saveAndShareBase64 } from '../../utils/fileExportService';
import { downloadReportPdf } from '../../utils/pdfService';
import { NUMERIC_REPORT_KEYS } from '../../utils/reportHtml';
import { buildXlsxBase64 } from '../../utils/excelWriter';
import { colors } from '../../theme/colors';

const REPORTS = [
  { key: 'credit_outstanding', label: 'Credit Outstanding', fetch: (params) => reportsApi.creditOutstanding(params) },
  { key: 'low_stock', label: 'Low Stock', fetch: (params) => reportsApi.lowStock(params) },
  { key: 'gst_register', label: 'GST Register', fetch: (params) => reportsApi.gstRegister(params) },
  { key: 'purchase_register', label: 'Purchase Register', fetch: (params) => reportsApi.purchaseRegister(params) },
  { key: 'expense_income', label: 'Expense vs Income', fetch: (params) => reportsApi.expenseIncome(params) },
  { key: 'profit', label: 'Profit', fetch: (params) => reportsApi.profit(params) },
];

const SALES_REPORTS = [
  {
    key: 'branch', label: 'Branch Wise Sales', apiPath: 'branch-wise-sales', fetch: reportsApi.branchWiseSales,
    rowKey: 'branch_name',
    columns: { branch_name: 'Branch', total_bills: 'Total Bills', total_items: 'Total Items', quantity: 'Quantity', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'route', label: 'Route Wise Sales', apiPath: 'route-wise-sales', fetch: reportsApi.routeWiseSales,
    rowKey: 'route_name',
    columns: { route_name: 'Route', total_bills: 'Total Bills', customers: 'Customers', quantity: 'Quantity', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'customer', label: 'Customer Wise Sales', apiPath: 'customer-wise-sales', fetch: reportsApi.customerWiseSales,
    rowKey: 'customer_name',
    columns: { customer_name: 'Customer', bills: 'Bills', items: 'Items', quantity: 'Quantity', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'supplier', label: 'Supplier Wise Sales', apiPath: 'supplier-wise-sales', fetch: reportsApi.supplierWiseSales,
    rowKey: 'supplier_name',
    columns: { supplier_name: 'Supplier', items_sold: 'Items Sold', quantity: 'Quantity', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'brand', label: 'Brand Wise Sales', apiPath: 'brand-wise-sales', fetch: reportsApi.brandWiseSales,
    rowKey: 'brand_name',
    columns: { brand_name: 'Brand', items_sold: 'Items Sold', quantity: 'Quantity', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'category', label: 'Category Wise Sales', apiPath: 'category-wise-sales', fetch: reportsApi.categoryWiseSales,
    rowKey: 'category_name',
    columns: { category_name: 'Category', items_sold: 'Items Sold', quantity: 'Quantity', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'brand_category', label: 'Brand & Category Wise Sales', apiPath: 'brand-category-wise-sales',
    fetch: async (params) => (await reportsApi.brandCategoryWiseSales(params)).map((r) => ({ ...r, _key: `${r.brand_name}__${r.category_name}` })),
    rowKey: '_key',
    columns: { brand_name: 'Brand', category_name: 'Category', items_sold: 'Items Sold', quantity: 'Quantity', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'item', label: 'Item Wise Sales', apiPath: 'item-wise-sales', fetch: reportsApi.itemWiseSales,
    rowKey: 'item_code',
    columns: { item_name: 'Item', item_code: 'SKU', barcode: 'Barcode', brand_name: 'Brand', category_name: 'Category', supplier_name: 'Supplier', quantity: 'Qty Sold', gross_sales: 'Gross Sales', discount: 'Discount', gst: 'GST', net_sales: 'Net Sales' },
  },
  {
    key: 'profit_invoice_wise', label: 'Invoice-wise Profit/Loss', apiPath: 'profit/invoice-wise',
    fetch: async (params) => (await reportsApi.profitInvoiceWise(params)).map((r, i) => ({ ...r, _key: `${r.invoice_no}_${i}` })),
    rowKey: '_key',
    columns: {
      invoice_no: 'Invoice #', invoice_date: 'Date', customer_name: 'Customer', item_name: 'Item', qty: 'Qty',
      cost_price: 'Cost Price', cost_amount: 'Cost Amount', selling_price: 'Selling Price', gross_amount: 'Gross Amount',
      discount: 'Discount', gst: 'GST', net_amount: 'Net Amount',
      invoice_paid_amount: 'Paid Amount', invoice_credit_amount: 'Credit Amount', profit_loss: 'Profit / Loss',
    },
  },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthStartStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

function sumColumn(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function getColumnWidth(k) {
  if (k === 'invoice_no' || k === 'item_code' || k === 'barcode' || k === 'phone' || k === 'reference_no') return 140;
  if (k === 'item_name' || k === 'customer_name' || k === 'supplier_name') return 180;
  if (k.endsWith('_name')) return 150;
  if (k === 'invoice_date' || k === 'date' || k.endsWith('_date') || k.endsWith('_at')) return 110;
  if (k === 'qty' || k === 'bills' || k === 'items' || k === 'items_sold' || k === 'total_bills' || k === 'total_items' || k === 'quantity' || k === 'customers') return 90;
  if (NUMERIC_REPORT_KEYS.has(k) || k.includes('price') || k.includes('amount') || k.includes('sales') || k.includes('profit') || k.includes('balance') || k.includes('gst')) return 130;
  return 120;
}

function SalesReportDetail({ report, onBack }) {
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [appliedFrom, setAppliedFrom] = useState(monthStartStr());
  const [appliedTo, setAppliedTo] = useState(todayStr());
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['sales-report', report.key, appliedFrom, appliedTo],
    queryFn: () => report.fetch({ from: appliedFrom, to: appliedTo }),
  });
  const rows = useMemo(() => query.data || [], [query.data]);
  const numericKeys = Object.keys(report.columns).filter((k) => NUMERIC_REPORT_KEYS.has(k));
  const firstTextColumnKey = Object.keys(report.columns).find((k) => !NUMERIC_REPORT_KEYS.has(k));

  const totals = useMemo(() => {
    const t = {};
    numericKeys.forEach((k) => { t[k] = sumColumn(rows, k); });
    return t;
  }, [rows, numericKeys]);

  const selectedRows = rows.filter((r) => selectedKeys.includes(String(r[report.rowKey])));
  const filtersText = `From ${appliedFrom} to ${appliedTo}`;

  const applyFilters = () => { setAppliedFrom(from); setAppliedTo(to); setSelectedKeys([]); };
  const clearFilters = () => { setFrom(monthStartStr()); setTo(todayStr()); setAppliedFrom(monthStartStr()); setAppliedTo(todayStr()); setSelectedKeys([]); };

  const toggleSelect = (key) => setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  const selectAll = () => setSelectedKeys(rows.map((r) => String(r[report.rowKey])));
  const clearSelection = () => setSelectedKeys([]);

  const runExport = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // A multi-segment apiPath (e.g. "profit/invoice-wise") is fine as a URL
  // segment but must never land in a filename — downloadAndShareFile writes
  // to CacheDir/<filename>, and a literal "/" there means writing into a
  // subdirectory that doesn't exist, which fails on-device.
  const fileBase = report.apiPath.replace(/\//g, '_');

  const exportExcel = () => runExport(() => downloadAndShareFile(`/reports/${report.apiPath}`, `${fileBase}.xlsx`, { from: appliedFrom, to: appliedTo, export: 1 }));
  const exportPdf = () => runExport(() => downloadReportPdf({ title: report.label, filtersText, columns: report.columns, rows, totalsRow: totals }, `${fileBase}.pdf`));

  const exportSelectedExcel = () => {
    if (selectedKeys.length === 0) return Alert.alert('Nothing selected', 'Select at least one row to export.');
    runExport(async () => {
      const base64 = buildXlsxBase64(report.columns, selectedRows, report.label);
      await saveAndShareBase64(base64, `${fileBase}_selected.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
  };
  const exportSelectedPdf = () => {
    if (selectedKeys.length === 0) return Alert.alert('Nothing selected', 'Select at least one row to export.');
    runExport(() => downloadReportPdf({
      title: `${report.label} — Selected`, filtersText: `${selectedRows.length} row(s) selected · ${filtersText}`,
      columns: report.columns, rows: selectedRows,
    }, `${fileBase}_selected.pdf`));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Icon name="back" size={18} color={colors.gold} style={styles.backIcon} />
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{report.label}</Text>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.dateField}>
          <Text style={styles.filterLabel}>From</Text>
          <TextInput value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" style={styles.dateInput} />
        </View>
        <View style={styles.dateField}>
          <Text style={styles.filterLabel}>To</Text>
          <TextInput value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" style={styles.dateInput} />
        </View>
        <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}><Text style={styles.applyBtnText}>Apply</Text></TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}><Text style={styles.clearBtnText}>Clear</Text></TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <ToolbarBtn label="Export Excel" onPress={exportExcel} disabled={busy} />
        <ToolbarBtn label="Export PDF" onPress={exportPdf} disabled={busy} />
      </View>

      <View style={styles.selectionBar}>
        <Text style={styles.selectionText}>{selectedKeys.length > 0 ? `${selectedKeys.length} selected` : `${rows.length} row(s)`}</Text>
        <View style={styles.selectionActions}>
          <TouchableOpacity onPress={clearSelection}><Text style={styles.linkBtn}>Clear Selection</Text></TouchableOpacity>
        </View>
      </View>
      {selectedKeys.length > 0 && (
        <View style={styles.selectionBar}>
          <TouchableOpacity style={styles.selectedExportBtn} onPress={exportSelectedExcel} disabled={busy}>
            <Text style={styles.selectedExportText}>Export Selected Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectedExportBtn} onPress={exportSelectedPdf} disabled={busy}>
            <Text style={styles.selectedExportText}>Export Selected PDF</Text>
          </TouchableOpacity>
        </View>
      )}

      {query.isLoading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : query.isError ? (
        <Text style={styles.errorText}>{friendlyErrorMessage(query.error)}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No data for this date range.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={{ minWidth: 44 + Object.keys(report.columns).reduce((s, k) => s + getColumnWidth(k), 0) }}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.tableHeaderRow}>
              <TouchableOpacity
                style={styles.checkboxCell}
                onPress={() => (selectedKeys.length > 0 ? clearSelection() : selectAll())}
              >
                <View style={[
                  styles.checkbox,
                  selectedKeys.length === rows.length && rows.length > 0 && styles.checkboxChecked,
                  selectedKeys.length > 0 && selectedKeys.length < rows.length && styles.checkboxIndeterminate,
                ]}>
                  {selectedKeys.length > 0 && selectedKeys.length < rows.length && <View style={styles.checkboxIndeterminateMark} />}
                </View>
              </TouchableOpacity>
              {Object.entries(report.columns).map(([k, label]) => {
                const isNum = NUMERIC_REPORT_KEYS.has(k);
                const colWidth = getColumnWidth(k);
                return (
                  <Text
                    key={k}
                    style={[
                      styles.tableHeaderCell,
                      { width: colWidth, textAlign: isNum ? 'right' : 'left' },
                    ]}
                  >
                    {label}
                  </Text>
                );
              })}
            </View>
            <FlatList
              data={rows}
              keyExtractor={(r, idx) => `${r[report.rowKey] || idx}-${idx}`}
              nestedScrollEnabled={true}
              refreshing={query.isFetching}
              onRefresh={query.refetch}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              removeClippedSubviews
              renderItem={({ item, index }) => {
                const rk = String(item[report.rowKey] || index);
                const isSelected = selectedKeys.includes(rk);
                const isEven = index % 2 === 0;
                return (
                  <TouchableOpacity
                    style={[
                      styles.tableRow,
                      isEven && styles.tableRowAlt,
                      isSelected && styles.tableRowSelected,
                    ]}
                    onPress={() => toggleSelect(rk)}
                  >
                    <View style={styles.checkboxCell}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]} />
                    </View>
                    {Object.keys(report.columns).map((k) => {
                      const isNum = NUMERIC_REPORT_KEYS.has(k);
                      const colWidth = getColumnWidth(k);
                      const val = item[k];
                      const displayVal = isNum && typeof val === 'number' ? val.toFixed(2) : String(val ?? '');
                      return (
                        <Text
                          key={k}
                          style={[
                            styles.tableCell,
                            { width: colWidth, textAlign: isNum ? 'right' : 'left' },
                            isNum && { fontWeight: '600' },
                          ]}
                          numberOfLines={2}
                        >
                          {displayVal}
                        </Text>
                      );
                    })}
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={
                <View style={styles.totalsRow}>
                  <View style={styles.checkboxCell} />
                  {Object.keys(report.columns).map((k) => {
                    const isNum = NUMERIC_REPORT_KEYS.has(k);
                    const colWidth = getColumnWidth(k);
                    return (
                      <Text
                        key={k}
                        style={[
                          styles.totalsCell,
                          { width: colWidth, textAlign: isNum ? 'right' : 'left' },
                        ]}
                      >
                        {isNum ? (totals[k] !== undefined ? totals[k].toFixed(2) : '') : (k === firstTextColumnKey ? 'Grand Total' : '')}
                      </Text>
                    );
                  })}
                </View>
              }
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function ToolbarBtn({ label, onPress, disabled }) {
  return (
    <TouchableOpacity style={[styles.toolbarBtn, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <Text style={styles.toolbarBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function titleCase(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ReportDetail({ report, onBack }) {
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [appliedFrom, setAppliedFrom] = useState(monthStartStr());
  const [appliedTo, setAppliedTo] = useState(todayStr());

  const query = useQuery({
    queryKey: ['report', report.key, appliedFrom, appliedTo],
    queryFn: () => report.fetch({ from: appliedFrom, to: appliedTo }),
  });
  const rows = useMemo(() => (Array.isArray(query.data) ? query.data : query.data ? [query.data] : []), [query.data]);
  const columns = useMemo(() => {
    const map = {};
    Object.keys(rows[0] || {}).forEach((k) => { map[k] = titleCase(k); });
    return map;
  }, [rows]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [busy, setBusy] = useState(false);

  const applyFilters = () => {
    if (from && to && from > to) {
      Alert.alert('Invalid Date Range', 'From date cannot be later than To date.');
      return;
    }
    setAppliedFrom(from);
    setAppliedTo(to);
    setSelectedKeys([]);
  };

  const clearFilters = () => {
    setFrom(monthStartStr());
    setTo(todayStr());
    setAppliedFrom(monthStartStr());
    setAppliedTo(todayStr());
    setSelectedKeys([]);
  };

  const toggleSelect = (idx) => setSelectedKeys((prev) => (prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]));
  const selectAll = () => setSelectedKeys(rows.map((_, idx) => idx));
  const clearSelection = () => setSelectedKeys([]);
  const selectedRows = selectedKeys.map((idx) => rows[idx]);
  const fileBase = report.key.replace(/-/g, '_');
  const filtersText = `From ${appliedFrom} to ${appliedTo}`;

  const runExport = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => runExport(async () => {
    const base64 = buildXlsxBase64(columns, rows, report.label);
    await saveAndShareBase64(base64, `${fileBase}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
  const exportPdf = () => runExport(() => downloadReportPdf({ title: report.label, filtersText, columns, rows }, `${fileBase}.pdf`));
  const exportSelectedExcel = () => {
    if (selectedKeys.length === 0) return Alert.alert('Nothing selected', 'Select at least one row to export.');
    runExport(async () => {
      const base64 = buildXlsxBase64(columns, selectedRows, report.label);
      await saveAndShareBase64(base64, `${fileBase}_selected.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
  };
  const exportSelectedPdf = () => {
    if (selectedKeys.length === 0) return Alert.alert('Nothing selected', 'Select at least one row to export.');
    runExport(() => downloadReportPdf({ title: `${report.label} — Selected`, filtersText: `${selectedRows.length} row(s) selected · ${filtersText}`, columns, rows: selectedRows }, `${fileBase}_selected.pdf`));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Icon name="back" size={18} color={colors.gold} style={styles.backIcon} />
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{report.label}</Text>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.dateField}>
          <Text style={styles.filterLabel}>From</Text>
          <TextInput value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" style={styles.dateInput} />
        </View>
        <View style={styles.dateField}>
          <Text style={styles.filterLabel}>To</Text>
          <TextInput value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" style={styles.dateInput} />
        </View>
        <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}><Text style={styles.applyBtnText}>Apply</Text></TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}><Text style={styles.clearBtnText}>Clear</Text></TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <ToolbarBtn label="Export Excel" onPress={exportExcel} disabled={busy} />
        <ToolbarBtn label="Export PDF" onPress={exportPdf} disabled={busy} />
      </View>

      <View style={styles.selectionBar}>
        <Text style={styles.selectionText}>{selectedKeys.length > 0 ? `${selectedKeys.length} selected` : `${rows.length} row(s)`}</Text>
        <View style={styles.selectionActions}>
          <TouchableOpacity onPress={selectAll}><Text style={styles.linkBtn}>Select All</Text></TouchableOpacity>
          <TouchableOpacity onPress={clearSelection}><Text style={styles.linkBtn}>Clear Selection</Text></TouchableOpacity>
        </View>
      </View>
      {selectedKeys.length > 0 && (
        <View style={styles.selectionBar}>
          <TouchableOpacity style={styles.selectedExportBtn} onPress={exportSelectedExcel} disabled={busy}>
            <Text style={styles.selectedExportText}>Export Selected Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectedExportBtn} onPress={exportSelectedPdf} disabled={busy}>
            <Text style={styles.selectedExportText}>Export Selected PDF</Text>
          </TouchableOpacity>
        </View>
      )}

      {rows.length === 0 ? (
        query.isLoading ? (
          <Text style={styles.empty}>Loading report data...</Text>
        ) : query.isError ? (
          <Text style={styles.errorText}>{friendlyErrorMessage(query.error)}</Text>
        ) : (
          <Text style={styles.empty}>No data for this report yet.</Text>
        )
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }}>
          <View>
            <View style={styles.tableHeaderRow}>
              <TouchableOpacity style={styles.checkboxCell} onPress={selectedKeys.length === rows.length ? clearSelection : selectAll}>
                <View
                  style={[
                    styles.checkbox,
                    selectedKeys.length === rows.length && styles.checkboxChecked,
                    selectedKeys.length > 0 && selectedKeys.length < rows.length && styles.checkboxIndeterminate,
                  ]}
                >
                  {selectedKeys.length > 0 && selectedKeys.length < rows.length && (
                    <View style={styles.checkboxIndeterminateMark} />
                  )}
                </View>
              </TouchableOpacity>
              {Object.keys(columns).map((c) => {
                const isNum = NUMERIC_REPORT_KEYS.has(c);
                const colWidth = getColumnWidth(c);
                return (
                  <Text
                    key={c}
                    style={[
                      styles.tableHeaderCell,
                      { width: colWidth, textAlign: isNum ? 'right' : 'left' },
                    ]}
                  >
                    {columns[c]}
                  </Text>
                );
              })}
            </View>
            <FlatList
              data={rows}
              keyExtractor={(_, idx) => String(idx)}
              nestedScrollEnabled={true}
              refreshing={query.isFetching}
              onRefresh={query.refetch}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              removeClippedSubviews
              renderItem={({ item, index }) => {
                const isSelected = selectedKeys.includes(index);
                const isEven = index % 2 === 0;
                return (
                  <TouchableOpacity
                    style={[
                      styles.tableRow,
                      isEven && styles.tableRowAlt,
                      isSelected && styles.tableRowSelected,
                    ]}
                    onPress={() => toggleSelect(index)}
                  >
                    <View style={styles.checkboxCell}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]} />
                    </View>
                    {Object.keys(columns).map((c) => {
                      const isNum = NUMERIC_REPORT_KEYS.has(c);
                      const colWidth = getColumnWidth(c);
                      const val = item[c];
                      const displayVal = isNum && typeof val === 'number' ? val.toFixed(2) : String(val ?? '');
                      return (
                        <Text
                          key={c}
                          style={[
                            styles.tableCell,
                            { width: colWidth, textAlign: isNum ? 'right' : 'left' },
                            isNum && { fontWeight: '600' },
                          ]}
                          numberOfLines={2}
                        >
                          {displayVal}
                        </Text>
                      );
                    })}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

export function ReportsScreen() {
  const [active, setActive] = useState(null);
  const [activeSales, setActiveSales] = useState(null);

  if (activeSales) return <SalesReportDetail report={activeSales} onBack={() => setActiveSales(null)} />;
  if (active) return <ReportDetail report={active} onBack={() => setActive(null)} />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={[{ type: 'salesHeader' }, ...SALES_REPORTS.map((r) => ({ type: 'sales', ...r })), { type: 'otherHeader' }, ...REPORTS.map((r) => ({ type: 'other', ...r }))]}
        keyExtractor={(r, idx) => `${r.type}-${r.key || idx}`}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          if (item.type === 'salesHeader') return <Text style={styles.sectionTitle}>Sales Reports</Text>;
          if (item.type === 'otherHeader') return <Text style={[styles.sectionTitle, styles.otherHeaderSpacing]}>Other Reports</Text>;
          const isSales = item.type === 'sales';
          return (
            <TouchableOpacity style={styles.menuRow} onPress={() => (isSales ? setActiveSales(item) : setActive(item))}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="reports" size={18} color={colors.gold} style={styles.backIcon} />
                <Text style={styles.menuText}>{item.label}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.inkMuted} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  sectionTitle: { fontWeight: '700', color: colors.ink, marginBottom: 8, fontSize: 14 },
  otherHeaderSpacing: { marginTop: 16 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  menuText: { color: colors.ink, fontWeight: '600' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  backIcon: { marginRight: 8 },
  back: { color: colors.gold, fontWeight: '700' },
  detailTitle: { fontWeight: '700', color: colors.ink, flex: 1 },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40 },
  errorText: { textAlign: 'center', color: colors.danger, marginTop: 40, paddingHorizontal: 20 },
  detailListContent: { padding: 12 },
  card: { backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  cardSelected: { borderColor: colors.gold, borderWidth: 2 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  fieldLabel: { color: colors.inkMuted, fontSize: 11, textTransform: 'capitalize' },
  fieldValue: { color: colors.ink, fontSize: 12, fontWeight: '600', flexShrink: 1, marginLeft: 8 },

  filterBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, flexWrap: 'wrap' },
  dateField: { minWidth: 110 },
  filterLabel: { fontSize: 11, color: colors.inkMuted, fontWeight: '600', marginBottom: 4 },
  dateInput: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, backgroundColor: colors.card },
  applyBtn: { backgroundColor: colors.gold, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  clearBtn: { backgroundColor: colors.page, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  clearBtnText: { color: colors.ink, fontWeight: '700', fontSize: 12 },

  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 10 },
  toolbarBtn: { backgroundColor: colors.navbar, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  toolbarBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },

  selectionBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, marginTop: 10, gap: 8 },
  selectionActions: { flexDirection: 'row', gap: 12 },
  selectionText: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  linkBtn: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  selectedExportBtn: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  selectedExportText: { color: colors.ink, fontWeight: '700', fontSize: 11 },

  tableHeaderRow: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 2, borderBottomColor: colors.borderSoft, paddingVertical: 10 },
  tableHeaderCell: { width: 120, fontWeight: '700', color: colors.ink, fontSize: 11, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, alignItems: 'center', backgroundColor: colors.card },
  tableRowAlt: { backgroundColor: '#F9FAFB' },
  tableRowSelected: { backgroundColor: '#FFFBEB' },
  tableCell: { width: 120, color: colors.ink, fontSize: 12, paddingHorizontal: 8 },
  checkboxCell: { width: 36, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.borderSoft },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkboxIndeterminate: { backgroundColor: colors.card, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  checkboxIndeterminateMark: { width: 10, height: 2, backgroundColor: colors.gold, borderRadius: 1 },
  totalsRow: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: 2, borderTopColor: colors.ink, marginTop: 4 },
  totalsCell: { width: 120, fontWeight: '700', color: colors.ink, fontSize: 12, paddingHorizontal: 8 },
});
