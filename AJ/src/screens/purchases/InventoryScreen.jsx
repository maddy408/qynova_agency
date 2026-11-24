import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  stockHubApi,
  stockAdjustmentsApi,
  vanStockApi,
  vanStockIssuesApi,
} from '../../api/purchasing';
import { itemsApi } from '../../api/catalog';
import { usersApi } from '../../api/users';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { saveAndShareBase64 } from '../../utils/fileExportService';
import { buildXlsxBase64 } from '../../utils/excelWriter';
import { downloadReportPdf } from '../../utils/pdfService';
import { colors } from '../../theme/colors';

const ADJUSTMENT_REASONS = [
  { id: 'damage', name: 'Stock Damage' },
  { id: 'spoilage', name: 'Spoilage' },
  { id: 'count_correction', name: 'Count Correction' },
  { id: 'other', name: 'Other' },
];

const OWNER_TYPE_OPTIONS = [
  { id: '', name: 'All Locations / Owners' },
  { id: 'branch', name: 'Main Branch / Floor' },
  { id: 'employee', name: 'Salesman Van Stock' },
];

const ORDER_SOURCE_TYPES = [
  { id: '', name: 'Plain Issue (no order)' },
  { id: 'customer_prebooking', name: 'Van Stock — Customer Order' },
  { id: 'purchase_request', name: 'Van Stock — Supplier Order' },
];

const STOCK_HUB_EXPORT_COLUMNS = {
  item_name: 'Item',
  item_code: 'SKU',
  barcode: 'Barcode',
  unit_code: 'Unit',
  quantity_on_hand: 'Quantity',
  cost_price: 'Cost Price',
  selling_price: 'Selling Price',
  stock_value: 'Stock Value',
  owner_name: 'Van/Salesman',
  branch_name: 'Branch',
};

const VAN_PENDING_EXPORT_COLUMNS = {
  item_name: 'Item',
  item_code: 'SKU',
  unit_code: 'Unit',
  quantity_on_hand: 'Salesman On-hand Qty',
};

const VAN_ISSUES_EXPORT_COLUMNS = {
  issue_no: 'Issue #',
  employee_name: 'Salesman',
  issued_at: 'Date',
  item_count: 'Items Count',
  total_qty: 'Total Qty',
};

const ADJUSTMENT_EXPORT_COLUMNS = {
  item_name: 'Item',
  adjustment_type: 'Type',
  qty: 'Quantity',
  reason: 'Reason',
  created_by_name: 'Created By',
  created_at: 'Date',
  remarks: 'Remarks',
};

export function InventoryScreen() {
  const canView = usePermission('inventory.view_stock');
  const canAdjust = usePermission('inventory.stock_adjustment');
  const canIssue = usePermission('inventory.issue_van_stock');

  const [mainTab, setMainTab] = useState('hub');

  return (
    <View style={styles.screen}>
      <SegmentedTabs
        tabs={[
          { key: 'hub', label: 'Stock Hub' },
          { key: 'van', label: 'Van / Salesman' },
          { key: 'adjust', label: 'Stock Adjustment' },
        ]}
        active={mainTab}
        onChange={setMainTab}
      />
      <View style={{ flex: 1, marginTop: 8 }}>
        {mainTab === 'hub' && (canView ? <StockHubPanel /> : <NoAccessText />)}
        {mainTab === 'van' && (canIssue || canView ? <VanStockPanel canManage={canIssue} /> : <NoAccessText />)}
        {mainTab === 'adjust' && <StockAdjustmentPanel canAdjust={canAdjust} />}
      </View>
    </View>
  );
}

function NoAccessText() {
  return <Text style={styles.empty}>You do not have permission to view this section.</Text>;
}

// -----------------------------------------------------------------------------
// MODULE 1: STOCK HUB PANEL (100% Website Parity)
// -----------------------------------------------------------------------------
function StockHubPanel() {
  const [ownerType, setOwnerType] = useState('');
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [viewItem, setViewItem] = useState(null);
  const [busy, setBusy] = useState(false);

  const stockQuery = useQuery({
    queryKey: ['stock-hub', ownerType],
    queryFn: () => stockHubApi.list(ownerType ? { owner_type: ownerType } : {}),
  });

  const lowStockQuery = useQuery({
    queryKey: ['stock-hub-low'],
    queryFn: stockHubApi.lowStock,
  });

  const rows = useMemo(() => stockQuery.data || [], [stockQuery.data]);
  const low = useMemo(() => lowStockQuery.data || [], [lowStockQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.item_name || '').toLowerCase().includes(q) ||
      (r.item_code || '').toLowerCase().includes(q) ||
      (r.owner_name || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const rowKey = (r, idx) => `${r.item_id || idx}-${r.owner_id || ''}-${r.owner_type || ''}`;
  const toggleSelect = (key) => setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const selectAll = () => setSelectedKeys(filtered.map((r, i) => rowKey(r, i)));
  const clearSelection = () => setSelectedKeys([]);

  const exportRows = selectedKeys.length > 0
    ? filtered.filter((r, i) => selectedKeys.includes(rowKey(r, i)))
    : filtered;

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

  const exportExcel = () => {
    if (exportRows.length === 0) return Alert.alert('Nothing to export', 'No stock records match the current filter.');
    runExport(async () => {
      const base64 = buildXlsxBase64(STOCK_HUB_EXPORT_COLUMNS, exportRows, 'Stock Hub Inventory');
      await saveAndShareBase64(base64, `stock_hub_${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
  };

  const exportPdf = () => {
    if (exportRows.length === 0) return Alert.alert('Nothing to export', 'No stock records match the current filter.');
    runExport(() =>
      downloadReportPdf(
        {
          title: 'Stock Hub — Real-time Inventory',
          filtersText: ownerType ? `Owner type: ${ownerType}${search ? ` · Search: "${search}"` : ''}` : (search ? `Search: "${search}"` : 'All locations/owners'),
          columns: STOCK_HUB_EXPORT_COLUMNS,
          rows: exportRows,
        },
        `stock_hub_${new Date().toISOString().slice(0, 10)}.pdf`
      )
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Low Stock Alert Banner (Website Parity) */}
      {low.length > 0 && (
        <View style={styles.alertBanner}>
          <Icon name="warning" size={18} color="#B45309" />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.alertTitle}>{low.length} Item(s) At or Below Minimum Stock</Text>
            <Text style={styles.alertSubtitle} numberOfLines={2}>
              {low.map((i) => `${i.item_name} (${i.item_code})`).join(', ')}
            </Text>
          </View>
        </View>
      )}

      {/* Summary Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statsCard}>
          <Text style={styles.statsLabel}>Distinct Records</Text>
          <Text style={styles.statsVal}>{rows.length}</Text>
        </View>
        <View style={[styles.statsCard, low.length > 0 ? styles.statsCardWarn : null]}>
          <Text style={styles.statsLabel}>Low Stock Alerts</Text>
          <Text style={[styles.statsVal, low.length > 0 ? { color: '#B45309' } : { color: colors.success }]}>
            {low.length}
          </Text>
        </View>
      </View>

      {/* Location Type Filter Pills */}
      <View style={styles.filterPillRow}>
        {OWNER_TYPE_OPTIONS.map((opt) => {
          const active = ownerType === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => setOwnerType(opt.id)}
            >
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{opt.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search stock by item or owner…"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearSearchBtn}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Selection & Export Bar */}
      <View style={styles.selectionBar}>
        <Text style={styles.selectionText}>
          {selectedKeys.length > 0 ? `${selectedKeys.length} selected` : `${filtered.length} item(s)`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={selectAll}><Text style={styles.linkBtn}>Select All</Text></TouchableOpacity>
          <TouchableOpacity onPress={clearSelection}><Text style={styles.linkBtn}>Clear</Text></TouchableOpacity>
        </View>
      </View>
      <View style={styles.selectionBar}>
        <TouchableOpacity style={styles.selectedExportBtn} onPress={exportExcel} disabled={busy}>
          <Text style={styles.selectedExportText}>{busy ? 'Exporting…' : 'Export Excel'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.selectedExportBtn} onPress={exportPdf} disabled={busy}>
          <Text style={styles.selectedExportText}>Export PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Stock Cards List */}
      <FlatList
        data={filtered}
        keyExtractor={rowKey}
        refreshing={stockQuery.isFetching}
        onRefresh={stockQuery.refetch}
        contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        ListEmptyComponent={
          stockQuery.isLoading ? (
            <ActivityIndicator size="small" color={colors.gold} style={{ marginTop: 30 }} />
          ) : (
            <Text style={styles.empty}>No stock records matching current filters.</Text>
          )
        }
        renderItem={({ item, index }) => {
          const k = rowKey(item, index);
          const isSelected = selectedKeys.includes(k);
          const isLow = Number(item.quantity_on_hand) <= 0;
          return (
            <View style={[styles.stockCard, isSelected && styles.stockCardSelected]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelect(k)}>
                  {isSelected && <View style={styles.checkboxFill} />}
                </TouchableOpacity>

                <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewItem(item)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.stockItemName} numberOfLines={1}>{item.item_name}</Text>
                    <View style={[styles.ownerBadge, item.owner_type === 'employee' ? styles.ownerBadgeEmployee : styles.ownerBadgeBranch]}>
                      <Text style={[styles.ownerBadgeText, item.owner_type === 'employee' ? styles.ownerBadgeTextEmployee : styles.ownerBadgeTextBranch]}>
                        {item.owner_type === 'employee' ? 'Salesman Van' : 'Branch Floor'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.stockSubText}>
                    SKU: {item.item_code || '-'} · Owner: <Text style={{ fontWeight: '700', color: colors.ink }}>{item.owner_name || '-'}</Text>
                  </Text>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={styles.stockUnitText}>Unit: {item.unit_code || 'pcs'}</Text>
                    <View style={[styles.qtyBadge, isLow ? styles.qtyBadgeLow : styles.qtyBadgeNormal]}>
                      <Text style={[styles.qtyBadgeText, isLow ? styles.qtyBadgeTextLow : styles.qtyBadgeTextNormal]}>
                        {item.quantity_on_hand} {item.unit_code || ''}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setViewItem(item)} style={{ padding: 6, marginLeft: 6 }}>
                  <Icon name="view" size={18} color={colors.gold} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      {/* Stock Detail Modal */}
      {viewItem && (
        <FormModal
          visible
          title={`Stock Detail: ${viewItem.item_name}`}
          onClose={() => setViewItem(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewItem(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Item Name" value={viewItem.item_name} />
            <DetailRow label="SKU / Code" value={viewItem.item_code || '-'} />
            <DetailRow label="Barcode" value={viewItem.barcode || '-'} />
            <DetailRow label="Location / Owner" value={viewItem.owner_name || '-'} />
            <DetailRow label="Owner Type" value={viewItem.owner_type === 'employee' ? 'Salesman Van' : 'Main Branch Floor'} />
            <DetailRow label="Branch" value={viewItem.branch_name || '-'} />
            <DetailRow label="Quantity on Hand" value={`${viewItem.quantity_on_hand} ${viewItem.unit_code || ''}`} />
            {viewItem.cost_price != null && <DetailRow label="Cost Price" value={`₹${Number(viewItem.cost_price).toFixed(2)}`} />}
            {viewItem.selling_price != null && <DetailRow label="Selling Price" value={`₹${Number(viewItem.selling_price).toFixed(2)}`} />}
            {viewItem.stock_value != null && <DetailRow label="Stock Value" value={`₹${Number(viewItem.stock_value).toFixed(2)}`} />}
          </View>
        </FormModal>
      )}
    </View>
  );
}

// -----------------------------------------------------------------------------
// MODULE 2: VAN / SALESMAN MODULE (100% Website Parity)
// -----------------------------------------------------------------------------
function VanStockPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState('ops'); // 'ops' | 'active' | 'issues'

  // Form State
  const [employeeId, setEmployeeId] = useState('');
  const [mode, setMode] = useState('issue'); // 'issue' | 'return' (Day-end return)
  const [orderSourceType, setOrderSourceType] = useState(''); // '' | 'customer_prebooking' | 'purchase_request'
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [lines, setLines] = useState([{ item_id: '', qty: '1' }]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [shortageWarning, setShortageWarning] = useState(null);

  // Active Van Stock / Export State
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [activeSearch, setActiveSearch] = useState('');
  const [busyExport, setBusyExport] = useState(false);

  // Issue Transactions State
  const [selectedIssueIds, setSelectedIssueIds] = useState([]);
  const [issueSearch, setIssueSearch] = useState('');
  const [viewIssue, setViewIssue] = useState(null);

  // Queries
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const itemsQuery = useQuery({ queryKey: ['items-all'], queryFn: () => itemsApi.list('') });
  const pendingQuery = useQuery({
    queryKey: ['van-pending', employeeId],
    queryFn: () => vanStockApi.pending(employeeId),
    enabled: !!employeeId,
  });
  const issuesQuery = useQuery({
    queryKey: ['van-issues', employeeId],
    queryFn: () => vanStockIssuesApi.list(employeeId || undefined),
  });
  const eligibleOrdersQuery = useQuery({
    queryKey: ['van-stock-eligible-orders', orderSourceType],
    queryFn: () => vanStockApi.eligibleOrders(orderSourceType === 'purchase_request' ? 'supplier' : 'customer'),
    enabled: mode === 'issue' && orderSourceType !== '',
  });

  const users = useMemo(() => usersQuery.data || [], [usersQuery.data]);
  const items = useMemo(() => itemsQuery.data || [], [itemsQuery.data]);
  const pending = useMemo(() => pendingQuery.data || [], [pendingQuery.data]);
  const issues = useMemo(() => issuesQuery.data || [], [issuesQuery.data]);
  const eligibleOrders = useMemo(() => eligibleOrdersQuery.data || [], [eligibleOrdersQuery.data]);
  const selectedOrder = eligibleOrders.find((o) => String(o.id) === String(selectedOrderId));
  const selectedEmployee = users.find((u) => String(u.id) === String(employeeId));

  // Multi-line Item Handlers
  const updateLine = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { item_id: '', qty: '1' }]);
  const removeLine = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // Handle Order Linking
  const handleOrderSourceTypeChange = (type) => {
    setOrderSourceType(type);
    setSelectedOrderId('');
    if (type === '') {
      setLines([{ item_id: '', qty: '1' }]);
    }
  };

  const handleSelectOrder = (orderId) => {
    setSelectedOrderId(orderId);
    const order = eligibleOrders.find((o) => String(o.id) === String(orderId));
    if (order && Array.isArray(order.items)) {
      const remainingItems = order.items.filter((it) => Number(it.remaining_qty) > 0);
      if (remainingItems.length > 0) {
        setLines(remainingItems.map((it) => ({
          item_id: String(it.item_id),
          qty: String(it.remaining_qty),
        })));
      }
    }
  };

  // Submit Mutation
  const mutation = useMutation({
    mutationFn: (payload) => (mode === 'issue' ? vanStockApi.issue(payload) : vanStockApi.returnStock(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['van-pending', employeeId] });
      queryClient.invalidateQueries({ queryKey: ['van-issues'] });
      queryClient.invalidateQueries({ queryKey: ['stock-hub'] });
      queryClient.invalidateQueries({ queryKey: ['van-stock-eligible-orders'] });
      setLines([{ item_id: '', qty: '1' }]);
      setNotes('');
      setOrderSourceType('');
      setSelectedOrderId('');
      setShortageWarning(null);
      Alert.alert('Success', mode === 'issue' ? 'Stock issued to salesman successfully!' : 'Van stock return recorded successfully!');
    },
  });

  const submitPayload = async (payload) => {
    try {
      await mutation.mutateAsync(payload);
    } catch (err) {
      if (mode === 'issue' && err?.response?.status === 409 && err?.response?.data?.warning === 'insufficient_stock') {
        setShortageWarning({ payload, shortages: err.response.data.shortages || [] });
        return;
      }
      setFormError(friendlyErrorMessage(err) || 'Failed to process van stock operation.');
    }
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!employeeId) return setFormError('Please select a salesman.');
    const validLines = lines.filter((l) => l.item_id && Number(l.qty) > 0);
    if (validLines.length === 0) return setFormError('Please add at least one valid item with positive quantity.');

    if (mode === 'issue' && orderSourceType !== '' && !selectedOrderId) {
      return setFormError('Please select an order to link this issue to, or select plain issue.');
    }

    const payload = {
      employee_id: Number(employeeId),
      items: validLines.map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty) })),
      notes: notes || null,
      ...(mode === 'issue' && orderSourceType !== '' && selectedOrderId
        ? { source_type: orderSourceType, source_id: Number(selectedOrderId) }
        : {}),
    };

    await submitPayload(payload);
  };

  const confirmShortageAndIssue = async () => {
    if (!shortageWarning) return;
    await submitPayload({ ...shortageWarning.payload, confirm_insufficient: true });
  };

  // Active Van Stock Selection & Export
  const filteredPending = useMemo(() => {
    const q = activeSearch.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) =>
      (p.item_name || '').toLowerCase().includes(q) ||
      (p.item_code || '').toLowerCase().includes(q)
    );
  }, [pending, activeSearch]);

  const toggleSelectPending = (id) => setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAllPending = () => setSelectedItemIds(filteredPending.map((p) => p.item_id));
  const clearSelectionPending = () => setSelectedItemIds([]);

  const exportPendingExcel = async () => {
    const rows = selectedItemIds.length > 0 ? filteredPending.filter((p) => selectedItemIds.includes(p.item_id)) : filteredPending;
    if (rows.length === 0) return Alert.alert('Nothing to export', 'No active van stock items to export.');
    setBusyExport(true);
    try {
      const base64 = buildXlsxBase64(VAN_PENDING_EXPORT_COLUMNS, rows, `Van Stock — ${selectedEmployee?.name || 'Salesman'}`);
      await saveAndShareBase64(base64, `van_stock_${employeeId}_${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusyExport(false);
    }
  };

  const exportPendingPdf = async () => {
    const rows = selectedItemIds.length > 0 ? filteredPending.filter((p) => selectedItemIds.includes(p.item_id)) : filteredPending;
    if (rows.length === 0) return Alert.alert('Nothing to export', 'No active van stock items to export.');
    setBusyExport(true);
    try {
      await downloadReportPdf({
        title: `Van Stock — ${selectedEmployee?.name || 'Salesman'}`,
        filtersText: `Salesman: ${selectedEmployee?.name || employeeId}`,
        columns: VAN_PENDING_EXPORT_COLUMNS,
        rows,
      }, `van_stock_${employeeId}.pdf`);
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusyExport(false);
    }
  };

  // Issue Transactions Search, Selection & Export
  const filteredIssues = useMemo(() => {
    const q = issueSearch.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter((i) =>
      (i.issue_no || '').toLowerCase().includes(q) ||
      (i.employee_name || '').toLowerCase().includes(q)
    );
  }, [issues, issueSearch]);

  const toggleSelectIssue = (id) => setSelectedIssueIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAllIssues = () => setSelectedIssueIds(filteredIssues.map((i) => i.id));
  const clearSelectionIssues = () => setSelectedIssueIds([]);

  const exportIssuesExcel = async () => {
    const rows = selectedIssueIds.length > 0 ? filteredIssues.filter((i) => selectedIssueIds.includes(i.id)) : filteredIssues;
    if (rows.length === 0) return Alert.alert('Nothing to export', 'No issue transactions to export.');
    setBusyExport(true);
    try {
      const base64 = buildXlsxBase64(VAN_ISSUES_EXPORT_COLUMNS, rows, 'Van Stock Issues');
      await saveAndShareBase64(base64, `van_issues_${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusyExport(false);
    }
  };

  const exportIssuesPdf = async () => {
    const rows = selectedIssueIds.length > 0 ? filteredIssues.filter((i) => selectedIssueIds.includes(i.id)) : filteredIssues;
    if (rows.length === 0) return Alert.alert('Nothing to export', 'No issue transactions to export.');
    setBusyExport(true);
    try {
      await downloadReportPdf({
        title: 'Van Stock Issue Transactions',
        filtersText: employeeId ? `Salesman: ${selectedEmployee?.name || employeeId}` : 'All Salesmen',
        columns: VAN_ISSUES_EXPORT_COLUMNS,
        rows,
      }, `van_issues.pdf`);
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusyExport(false);
    }
  };

  const openIssueDetail = async (issueId) => {
    try {
      const res = await vanStockIssuesApi.get(issueId);
      setViewIssue(res);
    } catch (e) {
      Alert.alert('Error', friendlyErrorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Sub-Navigation Tabs */}
      <View style={styles.subTabRow}>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'ops' && styles.subTabBtnActive]}
          onPress={() => setSubTab('ops')}
        >
          <Text style={[styles.subTabText, subTab === 'ops' && styles.subTabTextActive]}>Operations</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'active' && styles.subTabBtnActive]}
          onPress={() => setSubTab('active')}
        >
          <Text style={[styles.subTabText, subTab === 'active' && styles.subTabTextActive]}>Active Van Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTabBtn, subTab === 'issues' && styles.subTabBtnActive]}
          onPress={() => setSubTab('issues')}
        >
          <Text style={[styles.subTabText, subTab === 'issues' && styles.subTabTextActive]}>Issue History</Text>
        </TouchableOpacity>
      </View>

      {/* SUB-TAB 1: OPERATIONS (ISSUE & DAY-END RETURN) */}
      {subTab === 'ops' && (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {canManage ? (
            <View style={styles.card}>
              {/* Mode Switcher: Issue Stock vs Day-end Return */}
              <View style={styles.modeToggleRow}>
                <TouchableOpacity
                  style={[styles.modeToggleBtn, mode === 'issue' && styles.modeToggleBtnActive]}
                  onPress={() => { setMode('issue'); setFormError(''); }}
                >
                  <Text style={[styles.modeToggleText, mode === 'issue' && styles.modeToggleTextActive]}>Issue Stock</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeToggleBtn, mode === 'return' && styles.modeToggleBtnActive]}
                  onPress={() => {
                    setMode('return');
                    setFormError('');
                    setOrderSourceType('');
                    setSelectedOrderId('');
                    setLines([{ item_id: '', qty: '1' }]);
                  }}
                >
                  <Text style={[styles.modeToggleText, mode === 'return' && styles.modeToggleTextActive]}>Day-End Return</Text>
                </TouchableOpacity>
              </View>

              {formError ? <Text style={formStyles.error}>{formError}</Text> : null}

              {/* Salesman Picker */}
              <SelectField
                label="Salesman"
                value={employeeId}
                options={users}
                labelKey="name"
                valueKey="id"
                onChange={(id) => { setEmployeeId(id); setSelectedItemIds([]); }}
                placeholder="-- Select Salesman --"
                required
              />

              {/* Order Linking (for Issue Mode only) */}
              {mode === 'issue' && (
                <>
                  <SelectField
                    label="Link to an Order (optional)"
                    value={orderSourceType}
                    options={ORDER_SOURCE_TYPES}
                    labelKey="name"
                    valueKey="id"
                    onChange={handleOrderSourceTypeChange}
                    placeholder="Plain Issue (no order)"
                  />

                  {orderSourceType !== '' && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={formStyles.label}>
                        {orderSourceType === 'purchase_request' ? 'Supplier Order *' : 'Customer Order *'}
                      </Text>
                      {eligibleOrdersQuery.isLoading ? (
                        <ActivityIndicator size="small" color={colors.gold} style={{ padding: 8 }} />
                      ) : eligibleOrders.length === 0 ? (
                        <Text style={styles.emptyNote}>
                          No eligible {orderSourceType === 'purchase_request' ? 'approved supplier orders' : 'confirmed customer orders'} with remaining quantity.
                        </Text>
                      ) : (
                        <SelectField
                          value={selectedOrderId}
                          options={eligibleOrders.map((o) => ({
                            id: String(o.id),
                            name: `${o.prebooking_no || o.request_no} — ${o.customer_name || o.supplier_name}`,
                          }))}
                          labelKey="name"
                          valueKey="id"
                          onChange={handleSelectOrder}
                          placeholder="-- Select Order --"
                          required
                        />
                      )}

                      {selectedOrder && (
                        <View style={styles.orderPreviewBox}>
                          <Text style={styles.orderPreviewTitle}>
                            {selectedOrder.prebooking_no || selectedOrder.request_no}
                          </Text>
                          <Text style={styles.orderPreviewSub}>
                            {orderSourceType === 'purchase_request' ? 'Supplier' : 'Customer'}: {selectedOrder.customer_name || selectedOrder.supplier_name}
                          </Text>
                          {selectedOrder.items?.map((it) => (
                            <View key={it.item_id} style={styles.orderItemLine}>
                              <Text style={styles.orderItemName}>{it.item_name}</Text>
                              <Text style={styles.orderItemQty}>{it.issued_qty}/{it.qty} issued · <Text style={{ color: colors.gold, fontWeight: '700' }}>{it.remaining_qty} left</Text></Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* Stock Lines */}
              <Text style={[formStyles.label, { marginTop: 6 }]}>
                {mode === 'issue' ? 'Stock Lines to Issue *' : 'Stock Lines to Return *'}
              </Text>
              {lines.map((line, idx) => (
                <View key={idx} style={styles.lineCard}>
                  <View style={{ flex: 1 }}>
                    <SelectField
                      value={line.item_id}
                      options={mode === 'return' && pending.length > 0 ? pending : items}
                      labelKey="item_name"
                      valueKey={mode === 'return' && pending.length > 0 ? 'item_id' : 'id'}
                      onChange={(val) => updateLine(idx, { item_id: String(val) })}
                      placeholder="Select Item"
                    />
                  </View>
                  <View style={{ width: 80, marginLeft: 8 }}>
                    <Text style={formStyles.label}>Qty</Text>
                    <TextInput
                      keyboardType="numeric"
                      value={line.qty}
                      onChangeText={(val) => updateLine(idx, { qty: val })}
                      style={formStyles.input}
                      placeholder="1"
                      placeholderTextColor={colors.inkMuted}
                    />
                  </View>
                  {lines.length > 1 && (
                    <TouchableOpacity onPress={() => removeLine(idx)} style={styles.removeLineBtn}>
                      <Text style={styles.removeLineText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.addLineBtn} onPress={addLine}>
                <Text style={styles.addLineBtnText}>+ Add Another Item Line</Text>
              </TouchableOpacity>

              {/* Notes */}
              <Text style={[formStyles.label, { marginTop: 10 }]}>Notes / Remarks (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes…"
                placeholderTextColor={colors.inkMuted}
                style={[formStyles.input, { height: 60 }]}
                multiline
              />

              {/* Submit Button */}
              <TouchableOpacity
                style={[formStyles.primaryBtn, (!employeeId || mutation.isPending) && formStyles.disabled]}
                onPress={handleSubmit}
                disabled={!employeeId || mutation.isPending}
              >
                <Text style={formStyles.primaryBtnText}>
                  {mutation.isPending ? 'Processing…' : mode === 'issue' ? 'Issue Stock to Salesman' : 'Save Van Stock Return'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.empty}>You do not have permission to issue van stock.</Text>
          )}
        </ScrollView>
      )}

      {/* SUB-TAB 2: ACTIVE VAN STOCK (LIVE BALANCE) */}
      {subTab === 'active' && (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
            <SelectField
              label="Select Salesman to view live balance"
              value={employeeId}
              options={users}
              labelKey="name"
              valueKey="id"
              onChange={(id) => { setEmployeeId(id); setSelectedItemIds([]); }}
              placeholder="-- Choose Salesman --"
            />
          </View>

          {employeeId ? (
            <>
              <View style={styles.searchContainer}>
                <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
                <TextInput
                  value={activeSearch}
                  onChangeText={setActiveSearch}
                  placeholder="Filter active van items…"
                  placeholderTextColor={colors.inkMuted}
                  style={styles.searchInput}
                />
              </View>

              <View style={styles.selectionBar}>
                <Text style={styles.selectionText}>
                  {selectedItemIds.length > 0 ? `${selectedItemIds.length} selected` : `${filteredPending.length} item(s)`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={selectAllPending}><Text style={styles.linkBtn}>Select All</Text></TouchableOpacity>
                  <TouchableOpacity onPress={clearSelectionPending}><Text style={styles.linkBtn}>Clear</Text></TouchableOpacity>
                </View>
              </View>

              <View style={styles.selectionBar}>
                <TouchableOpacity style={styles.selectedExportBtn} onPress={exportPendingExcel} disabled={busyExport}>
                  <Text style={styles.selectedExportText}>Export Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectedExportBtn} onPress={exportPendingPdf} disabled={busyExport}>
                  <Text style={styles.selectedExportText}>Download PDF</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={filteredPending}
                keyExtractor={(item) => String(item.item_id)}
                refreshing={pendingQuery.isFetching}
                onRefresh={pendingQuery.refetch}
                contentContainerStyle={{ padding: 12 }}
                ListEmptyComponent={<Text style={styles.empty}>No active van stock assigned to this salesman.</Text>}
                renderItem={({ item }) => {
                  const isSelected = selectedItemIds.includes(item.item_id);
                  return (
                    <View style={[styles.stockCard, isSelected && styles.stockCardSelected]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelectPending(item.item_id)}>
                          {isSelected && <View style={styles.checkboxFill} />}
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stockItemName}>{item.item_name}</Text>
                          <Text style={styles.stockSubText}>SKU: {item.item_code || '-'} · Unit: {item.unit_code || '-'}</Text>
                        </View>
                        <View style={[styles.qtyBadge, styles.qtyBadgeNormal]}>
                          <Text style={[styles.qtyBadgeText, styles.qtyBadgeTextNormal]}>
                            {item.quantity_on_hand} {item.unit_code || ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            </>
          ) : (
            <Text style={styles.empty}>Please select a salesman above to view their active van stock.</Text>
          )}
        </View>
      )}

      {/* SUB-TAB 3: ISSUE HISTORY */}
      {subTab === 'issues' && (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
            <SelectField
              label="Filter by Salesman"
              value={employeeId}
              options={[{ id: '', name: 'All Salesmen' }, ...users]}
              labelKey="name"
              valueKey="id"
              onChange={(id) => { setEmployeeId(id); setSelectedIssueIds([]); }}
              placeholder="All Salesmen"
            />
          </View>

          <View style={styles.searchContainer}>
            <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
            <TextInput
              value={issueSearch}
              onChangeText={setIssueSearch}
              placeholder="Search by issue # or salesman…"
              placeholderTextColor={colors.inkMuted}
              style={styles.searchInput}
            />
          </View>

          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>
              {selectedIssueIds.length > 0 ? `${selectedIssueIds.length} selected` : `${filteredIssues.length} issue(s)`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={selectAllIssues}><Text style={styles.linkBtn}>Select All</Text></TouchableOpacity>
              <TouchableOpacity onPress={clearSelectionIssues}><Text style={styles.linkBtn}>Clear</Text></TouchableOpacity>
            </View>
          </View>

          <View style={styles.selectionBar}>
            <TouchableOpacity style={styles.selectedExportBtn} onPress={exportIssuesExcel} disabled={busyExport}>
              <Text style={styles.selectedExportText}>Export Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectedExportBtn} onPress={exportIssuesPdf} disabled={busyExport}>
              <Text style={styles.selectedExportText}>Download PDF</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={filteredIssues}
            keyExtractor={(item) => String(item.id)}
            refreshing={issuesQuery.isFetching}
            onRefresh={issuesQuery.refetch}
            contentContainerStyle={{ padding: 12 }}
            ListEmptyComponent={<Text style={styles.empty}>No issue transactions found.</Text>}
            renderItem={({ item }) => {
              const isSelected = selectedIssueIds.includes(item.id);
              return (
                <View style={[styles.stockCard, isSelected && styles.stockCardSelected]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelectIssue(item.id)}>
                      {isSelected && <View style={styles.checkboxFill} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => openIssueDetail(item.id)}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[styles.stockItemName, { color: colors.gold }]}>{item.issue_no}</Text>
                        <Text style={{ fontWeight: '700', color: colors.ink }}>{item.total_qty} units</Text>
                      </View>
                      <Text style={styles.stockSubText}>Salesman: {item.employee_name} · {item.item_count} item(s)</Text>
                      <Text style={[styles.stockSubText, { fontSize: 11, color: colors.inkMuted }]}>{item.issued_at}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openIssueDetail(item.id)} style={{ padding: 6, marginLeft: 6 }}>
                      <Icon name="view" size={18} color={colors.gold} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </View>
      )}

      {/* Stock Shortage Warning Dialog (409 Insufficient Stock Handling) */}
      {shortageWarning && (
        <FormModal
          visible
          title="Stock Warning"
          onClose={() => setShortageWarning(null)}
          footer={
            <>
              <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => setShortageWarning(null)}>
                <Text style={formStyles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[formStyles.primaryBtn, mutation.isPending && formStyles.disabled]}
                onPress={confirmShortageAndIssue}
                disabled={mutation.isPending}
              >
                <Text style={formStyles.primaryBtnText}>{mutation.isPending ? 'Issuing…' : 'Continue & Issue'}</Text>
              </TouchableOpacity>
            </>
          }
        >
          <View style={styles.detailBox}>
            <Text style={{ fontSize: 13, color: '#B45309', fontWeight: '700', marginBottom: 8 }}>
              The requested quantity exceeds available stock for one or more items:
            </Text>
            {shortageWarning.shortages?.map((s) => (
              <View key={s.item_id} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.borderSoft }}>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{s.item_name}</Text>
                <Text style={{ fontSize: 12, color: colors.inkMuted }}>
                  Available: {s.available} · Requested: {s.requested} · Exceeds by: <Text style={{ color: colors.danger, fontWeight: '700' }}>{s.excess}</Text>
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 12, color: colors.inkMuted, marginTop: 10 }}>
              Do you want to continue and issue anyway?
            </Text>
          </View>
        </FormModal>
      )}

      {/* Issue Details Modal */}
      {viewIssue && (
        <FormModal
          visible
          title={`Issue Details: ${viewIssue.issue_no}`}
          onClose={() => setViewIssue(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewIssue(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Issue #" value={viewIssue.issue_no} />
            <DetailRow label="Salesman" value={viewIssue.employee_name} />
            <DetailRow label="Route" value={viewIssue.route_name || '-'} />
            <DetailRow label="Issued By" value={viewIssue.issued_by_name || '-'} />
            <DetailRow label="Date" value={viewIssue.issued_at} />
            <DetailRow label="Notes" value={viewIssue.notes || '-'} />
            <Text style={{ fontWeight: '700', color: colors.ink, marginTop: 12, marginBottom: 6 }}>Issued Items:</Text>
            {viewIssue.items?.map((it, idx) => (
              <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.borderSoft }}>
                <Text style={{ fontSize: 12, color: colors.ink, fontWeight: '600', flex: 1 }}>{it.item_name} ({it.item_code})</Text>
                <Text style={{ fontSize: 12, color: colors.gold, fontWeight: '700' }}>{it.qty} {it.unit_code || ''}</Text>
              </View>
            ))}
          </View>
        </FormModal>
      )}
    </View>
  );
}

// -----------------------------------------------------------------------------
// MODULE 3: STOCK ADJUSTMENT PANEL (100% Website Parity)
// -----------------------------------------------------------------------------
function StockAdjustmentPanel({ canAdjust }) {
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('addition');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('damage');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDetail, setHistoryDetail] = useState(null);
  const [selectedAdjustIds, setSelectedAdjustIds] = useState([]);
  const [busyExport, setBusyExport] = useState(false);

  const itemsQuery = useQuery({ queryKey: ['items-adjust'], queryFn: () => itemsApi.list('') });
  const stockQuery = useQuery({ queryKey: ['stock-hub', 'branch'], queryFn: () => stockHubApi.list({ owner_type: 'branch' }) });
  const adjustmentsQuery = useQuery({ queryKey: ['stock-adjustments'], queryFn: stockAdjustmentsApi.list });

  const items = useMemo(() => itemsQuery.data || [], [itemsQuery.data]);
  const stockRows = useMemo(() => stockQuery.data || [], [stockQuery.data]);
  const history = useMemo(() => adjustmentsQuery.data || [], [adjustmentsQuery.data]);

  const selectedItem = items.find((i) => String(i.id) === String(itemId));
  const currentStock = Number(stockRows.find((r) => String(r.item_id) === String(itemId))?.quantity_on_hand ?? 0);
  const qtyNum = Number(qty || 0);
  const newStock = adjustmentType === 'addition' ? currentStock + qtyNum : currentStock - qtyNum;

  const createMutation = useMutation({
    mutationFn: stockAdjustmentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['stock-hub'] });
      setConfirmVisible(false);
      setItemId('');
      setQty('');
      setRemarks('');
      setReason('damage');
      setAdjustmentType('addition');
      Alert.alert('Saved', 'Stock adjustment recorded and inventory updated successfully!');
    },
    onError: (e) => {
      setConfirmVisible(false);
      setFormError(friendlyErrorMessage(e));
    },
  });

  const openConfirm = () => {
    setFormError('');
    if (!itemId) return setFormError('Please select an item.');
    if (!qty || qtyNum <= 0) return setFormError('Please enter a valid positive quantity.');
    if (adjustmentType === 'deduction' && qtyNum > currentStock) {
      return setFormError(`Cannot deduct ${qtyNum} — only ${currentStock} available in stock.`);
    }
    setConfirmVisible(true);
  };

  const submitAdjustment = () => {
    createMutation.mutate({
      item_id: Number(itemId),
      adjustment_type: adjustmentType,
      qty: qtyNum,
      reason,
      remarks: remarks || null,
    });
  };

  // Filter History
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter((a) =>
      (a.item_name || '').toLowerCase().includes(q) ||
      (a.reason || '').toLowerCase().includes(q) ||
      (a.created_by_name || '').toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  const toggleSelectAdjust = (id) => setSelectedAdjustIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAllAdjust = () => setSelectedAdjustIds(filteredHistory.map((a) => a.id));
  const clearSelectionAdjust = () => setSelectedAdjustIds([]);

  const exportAdjustExcel = async () => {
    const rows = selectedAdjustIds.length > 0 ? filteredHistory.filter((a) => selectedAdjustIds.includes(a.id)) : filteredHistory;
    if (rows.length === 0) return Alert.alert('Nothing to export', 'No adjustment records to export.');
    setBusyExport(true);
    try {
      const base64 = buildXlsxBase64(ADJUSTMENT_EXPORT_COLUMNS, rows, 'Stock Adjustments');
      await saveAndShareBase64(base64, `stock_adjustments_${new Date().toISOString().slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusyExport(false);
    }
  };

  const exportAdjustPdf = async () => {
    const rows = selectedAdjustIds.length > 0 ? filteredHistory.filter((a) => selectedAdjustIds.includes(a.id)) : filteredHistory;
    if (rows.length === 0) return Alert.alert('Nothing to export', 'No adjustment records to export.');
    setBusyExport(true);
    try {
      await downloadReportPdf({
        title: 'Stock Adjustment History',
        filtersText: historySearch ? `Search: "${historySearch}"` : 'All Adjustments',
        columns: ADJUSTMENT_EXPORT_COLUMNS,
        rows,
      }, `stock_adjustments.pdf`);
    } catch (e) {
      Alert.alert('Export failed', friendlyErrorMessage(e));
    } finally {
      setBusyExport(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
      {/* Form Section */}
      {canAdjust && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>New Stock Adjustment</Text>

          {formError ? <Text style={formStyles.error}>{formError}</Text> : null}

          <SelectField
            label="Select Item *"
            value={itemId}
            options={items}
            labelKey="item_name"
            valueKey="id"
            onChange={setItemId}
            placeholder="-- Select Item --"
            required
          />

          {itemId ? (
            <Text style={styles.currentStockText}>
              Current Stock: <Text style={{ fontWeight: '700', color: colors.ink }}>{currentStock}</Text> {selectedItem?.base_unit_code || ''}
            </Text>
          ) : null}

          <Text style={formStyles.label}>Adjustment Type *</Text>
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[styles.typeBtn, adjustmentType === 'addition' && styles.typeBtnActive]}
              onPress={() => setAdjustmentType('addition')}
            >
              <Text style={adjustmentType === 'addition' ? styles.typeTextActive : styles.typeText}>+ Addition</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, adjustmentType === 'deduction' && styles.typeBtnActive]}
              onPress={() => setAdjustmentType('deduction')}
            >
              <Text style={adjustmentType === 'deduction' ? styles.typeTextActive : styles.typeText}>- Deduction</Text>
            </TouchableOpacity>
          </View>

          <Text style={formStyles.label}>Quantity *</Text>
          <TextInput
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
            placeholder="Enter quantity"
            placeholderTextColor={colors.inkMuted}
            style={formStyles.input}
          />

          <SelectField
            label="Reason *"
            value={reason}
            options={ADJUSTMENT_REASONS}
            labelKey="name"
            valueKey="id"
            onChange={setReason}
            required
          />

          <Text style={formStyles.label}>Remarks / Note (optional)</Text>
          <TextInput
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Additional explanation…"
            placeholderTextColor={colors.inkMuted}
            style={[formStyles.input, { height: 60 }]}
            multiline
          />

          <TouchableOpacity style={[formStyles.primaryBtn, { marginTop: 10 }]} onPress={openConfirm}>
            <Text style={formStyles.primaryBtnText}>Save Stock Adjustment</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* History Header & Search */}
      <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Stock Adjustment History</Text>
      <View style={[styles.searchContainer, { marginHorizontal: 0 }]}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={historySearch}
          onChangeText={setHistorySearch}
          placeholder="Search adjustments by item, reason, user…"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
        />
      </View>

      <View style={[styles.selectionBar, { paddingHorizontal: 0 }]}>
        <Text style={styles.selectionText}>
          {selectedAdjustIds.length > 0 ? `${selectedAdjustIds.length} selected` : `${filteredHistory.length} record(s)`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={selectAllAdjust}><Text style={styles.linkBtn}>Select All</Text></TouchableOpacity>
          <TouchableOpacity onPress={clearSelectionAdjust}><Text style={styles.linkBtn}>Clear</Text></TouchableOpacity>
        </View>
      </View>

      <View style={[styles.selectionBar, { paddingHorizontal: 0 }]}>
        <TouchableOpacity style={styles.selectedExportBtn} onPress={exportAdjustExcel} disabled={busyExport}>
          <Text style={styles.selectedExportText}>Export Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.selectedExportBtn} onPress={exportAdjustPdf} disabled={busyExport}>
          <Text style={styles.selectedExportText}>Download PDF</Text>
        </TouchableOpacity>
      </View>

      {/* History List */}
      {filteredHistory.map((a) => {
        const isSelected = selectedAdjustIds.includes(a.id);
        const isAdd = a.adjustment_type === 'addition';
        return (
          <View key={a.id} style={[styles.stockCard, isSelected && styles.stockCardSelected]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelectAdjust(a.id)}>
                {isSelected && <View style={styles.checkboxFill} />}
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setHistoryDetail(a)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.stockItemName} numberOfLines={1}>{a.item_name}</Text>
                  <View style={[styles.ownerBadge, isAdd ? styles.ownerBadgeBranch : styles.ownerBadgeEmployee]}>
                    <Text style={[styles.ownerBadgeText, isAdd ? styles.ownerBadgeTextBranch : styles.ownerBadgeTextEmployee]}>
                      {isAdd ? '+ Addition' : '- Deduction'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.stockSubText}>Reason: {a.reason?.replace('_', ' ')} · By: {a.created_by_name || '-'}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.inkMuted }}>{a.created_at}</Text>
                  <Text style={{ fontWeight: '700', color: isAdd ? colors.success : colors.danger }}>
                    {isAdd ? '+' : '-'}{a.qty}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setHistoryDetail(a)} style={{ padding: 6, marginLeft: 6 }}>
                <Icon name="view" size={18} color={colors.gold} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      {filteredHistory.length === 0 && (
        <Text style={styles.empty}>No adjustment records found.</Text>
      )}

      {/* Confirmation Modal */}
      {confirmVisible && (
        <FormModal
          visible
          title="Confirm Stock Adjustment"
          onClose={() => setConfirmVisible(false)}
          footer={
            <>
              <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => setConfirmVisible(false)}>
                <Text style={formStyles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]}
                onPress={submitAdjustment}
                disabled={createMutation.isPending}
              >
                <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Saving…' : 'Confirm & Save'}</Text>
              </TouchableOpacity>
            </>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Item" value={selectedItem?.item_name || ''} />
            <DetailRow label="Current Stock" value={`${currentStock} ${selectedItem?.base_unit_code || ''}`} />
            <DetailRow label="Adjustment" value={`${adjustmentType === 'addition' ? '+' : '-'}${qtyNum}`} />
            <DetailRow label="New Stock" value={`${newStock} ${selectedItem?.base_unit_code || ''}`} />
            <DetailRow label="Reason" value={reason.replace('_', ' ')} />
            <DetailRow label="Remarks" value={remarks || '-'} />
          </View>
        </FormModal>
      )}

      {/* History Detail Modal */}
      {historyDetail && (
        <FormModal
          visible
          title="Adjustment Detail"
          onClose={() => setHistoryDetail(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setHistoryDetail(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Item" value={historyDetail.item_name} />
            <DetailRow label="Adjustment Type" value={historyDetail.adjustment_type === 'addition' ? '+ Addition' : '- Deduction'} />
            <DetailRow label="Quantity" value={String(historyDetail.qty)} />
            <DetailRow label="Reason" value={historyDetail.reason?.replace('_', ' ')} />
            <DetailRow label="Remarks / Note" value={historyDetail.remarks || '-'} />
            <DetailRow label="Created By" value={historyDetail.created_by_name || '-'} />
            <DetailRow label="Date" value={historyDetail.created_at} />
          </View>
        </FormModal>
      )}
    </ScrollView>
  );
}

// -----------------------------------------------------------------------------
// HELPER COMPONENTS & STYLES
// -----------------------------------------------------------------------------
function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={styles.detailVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  sectionTitle: {
    fontWeight: '800',
    color: colors.ink,
    fontSize: 15,
    marginBottom: 10,
  },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 30, fontSize: 13 },
  emptyNote: { fontSize: 12, color: colors.inkMuted, backgroundColor: colors.page, padding: 10, borderRadius: 8 },

  // Alert Banner
  alertBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertTitle: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  alertSubtitle: { fontSize: 11, color: '#B45309', marginTop: 2 },

  // Stats Row
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, marginTop: 8 },
  statsCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 10,
  },
  statsCardWarn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  statsLabel: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  statsVal: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 2 },

  // Filter Pills
  filterPillRow: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 8, gap: 6 },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  filterPillActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  filterPillText: { fontSize: 11, fontWeight: '600', color: colors.inkMuted },
  filterPillTextActive: { color: '#fff', fontWeight: '700' },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.ink,
  },
  clearSearchBtn: { fontSize: 14, color: colors.inkMuted, paddingHorizontal: 6 },

  // Selection & Export Bar
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 6,
    gap: 8,
  },
  selectionText: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  linkBtn: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  selectedExportBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
  },
  selectedExportText: { color: colors.ink, fontWeight: '700', fontSize: 11 },

  // Checkbox
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxFill: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.gold },

  // Stock Cards
  stockCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  stockCardSelected: { borderColor: colors.gold, borderWidth: 1.5, backgroundColor: '#FFFBEB' },
  stockItemName: { fontSize: 13, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  stockSubText: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  stockUnitText: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },

  ownerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1 },
  ownerBadgeBranch: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  ownerBadgeEmployee: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  ownerBadgeText: { fontSize: 10, fontWeight: '700' },
  ownerBadgeTextBranch: { color: '#1D4ED8' },
  ownerBadgeTextEmployee: { color: '#047857' },

  qtyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  qtyBadgeNormal: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  qtyBadgeLow: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  qtyBadgeText: { fontSize: 12, fontWeight: '800' },
  qtyBadgeTextNormal: { color: '#047857' },
  qtyBadgeTextLow: { color: '#DC2626' },

  // Detail Modal Box
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 12 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 12, flexShrink: 1, textAlign: 'right', marginLeft: 8 },

  // Sub Tab Row
  subTabRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    marginTop: 4,
  },
  subTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  subTabBtnActive: { backgroundColor: colors.gold },
  subTabText: { fontSize: 12, fontWeight: '600', color: colors.inkMuted },
  subTabTextActive: { color: '#fff', fontWeight: '700' },

  // Mode Toggle (Issue vs Return)
  modeToggleRow: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    marginBottom: 12,
  },
  modeToggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.page },
  modeToggleBtnActive: { backgroundColor: colors.navbar },
  modeToggleText: { fontSize: 12, fontWeight: '600', color: colors.inkMuted },
  modeToggleTextActive: { color: colors.gold, fontWeight: '700' },

  // Order Preview Box
  orderPreviewBox: {
    backgroundColor: colors.page,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 10,
    marginTop: 6,
  },
  orderPreviewTitle: { fontSize: 12, fontWeight: '700', color: colors.ink },
  orderPreviewSub: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  orderItemLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  orderItemName: { fontSize: 11, fontWeight: '600', color: colors.ink },
  orderItemQty: { fontSize: 11, color: colors.inkMuted },

  // Stock Line Builder
  lineCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.page,
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  removeLineBtn: { padding: 8, marginBottom: 4 },
  removeLineText: { color: colors.danger, fontWeight: '800', fontSize: 14 },
  addLineBtn: { paddingVertical: 6, alignItems: 'flex-start', marginTop: 2 },
  addLineBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },

  // Type Toggle (Addition vs Deduction)
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    marginBottom: 10,
  },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.page },
  typeBtnActive: { backgroundColor: colors.gold },
  typeText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  typeTextActive: { fontSize: 12, color: '#fff', fontWeight: '700' },
  currentStockText: { color: colors.inkMuted, fontSize: 12, marginBottom: 8, marginTop: -4 },
});
