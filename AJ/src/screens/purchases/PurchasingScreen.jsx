import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesApi, purchaseRequestsApi, supplierPaymentsApi, routeSuppliersApi } from '../../api/purchasing';
import { suppliersApi, routesApi } from '../../api/parties';
import { itemsApi } from '../../api/catalog';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { GrnItemLineEditor } from '../../components/GrnItemLineEditor';
import { ItemLineEditor } from '../../components/ItemLineEditor';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';
import { buildXlsxBase64 } from '../../utils/excelWriter';
import { saveAndShareBase64 } from '../../utils/fileExportService';
import { downloadReportPdf } from '../../utils/pdfService';

const STATUS_COLORS = {
  open: colors.warning,
  approved: colors.gold,
  partially_received: colors.gold,
  converted_to_grn: colors.success,
  cancelled: colors.danger,
  completed: colors.success,
  pending: colors.warning,
};

// =============================================================================
// A. PURCHASE ORDER TAB
// =============================================================================
function PurchaseOrderTab({ modalVisible, setModalVisible }) {
  const queryClient = useQueryClient();
  const canCreate = usePermission('orders.create_purchase_indent');
  const canApprove = usePermission('orders.approve_purchase_request');

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [viewPo, setViewPo] = useState(null);

  const poQuery = useQuery({ queryKey: ['purchase-requests'], queryFn: purchaseRequestsApi.list });
  const rows = poQuery.data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const no = (r.request_no || '').toLowerCase();
      const sup = (r.supplier_name || '').toLowerCase();
      const rt = (r.route_name || '').toLowerCase();
      const st = (r.status || '').toLowerCase();
      return no.includes(q) || sup.includes(q) || rt.includes(q) || st.includes(q);
    });
  }, [rows, search]);

  const cancelMutation = useMutation({
    mutationFn: purchaseRequestsApi.cancel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      Alert.alert('Cancelled', 'Purchase order cancelled successfully.');
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const approveMutation = useMutation({
    mutationFn: purchaseRequestsApi.approve,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      Alert.alert('Approved', 'Purchase order approved successfully.');
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.id));
    }
  };

  const poColumns = {
    request_no: 'PO Number',
    supplier_name: 'Supplier',
    route_name: 'Route',
    request_date: 'Order Date',
    item_count: 'Items',
    estimated_total: 'Total Amount (Rs.)',
    status: 'Status',
  };

  const handleExportExcel = async (onlySelected = false) => {
    const targetRows = onlySelected
      ? filtered.filter((r) => selectedIds.includes(r.id))
      : filtered;

    if (targetRows.length === 0) {
      Alert.alert('Export', 'No records to export.');
      return;
    }
    setExportBusy(true);
    try {
      const b64 = buildXlsxBase64(poColumns, targetRows, 'PurchaseOrders');
      await saveAndShareBase64(b64, 'purchase_orders.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      Alert.alert('Export Error', friendlyErrorMessage(e));
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadPdf = async (singlePo = null) => {
    setExportBusy(true);
    try {
      if (singlePo) {
        const fullPo = await purchaseRequestsApi.get(singlePo.id);
        const reportData = {
          title: `Purchase Order - ${fullPo.request_no}`,
          filtersText: `Supplier: ${fullPo.supplier_name || '-'} | Date: ${fullPo.request_date || fullPo.created_at || '-'} | Status: ${fullPo.status}`,
          columns: { item_name: 'Item', qty: 'Qty', rate: 'Purchase Rate', line_total: 'Amount' },
          rows: (fullPo.items || []).map((it) => ({
            item_name: it.item_name || `Item #${it.item_id}`,
            qty: it.qty,
            rate: `Rs. ${Number(it.rate || 0).toFixed(2)}`,
            line_total: `Rs. ${(Number(it.qty || 0) * Number(it.rate || 0)).toFixed(2)}`,
          })),
          totalsRow: {
            item_name: 'Grand Total',
            qty: (fullPo.items || []).reduce((s, it) => s + Number(it.qty || 0), 0),
            line_total: `Rs. ${Number(fullPo.estimated_total || 0).toFixed(2)}`,
          },
        };
        await downloadReportPdf(reportData, `po_${fullPo.request_no}.pdf`);
      } else {
        const targetRows = selectedIds.length > 0
          ? filtered.filter((r) => selectedIds.includes(r.id))
          : filtered;

        const reportData = {
          title: 'Purchase Orders Register',
          filtersText: `Total Orders: ${targetRows.length}`,
          columns: poColumns,
          rows: targetRows.map((r) => ({
            ...r,
            route_name: r.route_name || '-',
            estimated_total: `Rs. ${Number(r.estimated_total || 0).toFixed(2)}`,
          })),
        };
        await downloadReportPdf(reportData, 'purchase_orders_list.pdf');
      }
    } catch (e) {
      Alert.alert('PDF Error', friendlyErrorMessage(e));
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by PO #, supplier, route, status..."
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Export Toolbar */}
      <View style={styles.exportToolbar}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleExportExcel(false)} disabled={exportBusy}>
          <Text style={styles.toolbarBtnText}>📊 Export Excel</Text>
        </TouchableOpacity>
        {selectedIds.length > 0 && (
          <TouchableOpacity style={[styles.toolbarBtn, { backgroundColor: colors.gold }]} onPress={() => handleExportExcel(true)} disabled={exportBusy}>
            <Text style={[styles.toolbarBtnText, { color: '#fff' }]}>Export Selected ({selectedIds.length})</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleDownloadPdf()} disabled={exportBusy}>
          <Text style={styles.toolbarBtnText}>📄 Download PDF</Text>
        </TouchableOpacity>
        {filtered.length > 0 && (
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
            <Text style={styles.selectAllBtnText}>
              {selectedIds.length === filtered.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={poQuery.isFetching}
        onRefresh={poQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No purchase orders found.</Text>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <Text style={styles.empty}>No purchase orders match "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => {
          const isSelected = selectedIds.includes(r.id);
          return (
            <View style={[styles.card, isSelected && styles.cardSelected]}>
              <View style={styles.cardHeader}>
                <TouchableOpacity onPress={() => toggleSelect(r.id)} style={styles.checkboxTouch}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={styles.cardTitle}>{r.request_no}</Text>
                </TouchableOpacity>
                <Text style={[styles.status, { color: STATUS_COLORS[r.status] || colors.gold }]}>
                  {r.status?.replace(/_/g, ' ')?.toUpperCase()}
                </Text>
              </View>

              <Text style={styles.cardMeta}>
                {r.supplier_name} · {r.request_date || r.created_at || 'Date N/A'}
              </Text>
              {r.route_name ? <Text style={styles.cardMeta}>Route: {r.route_name}</Text> : null}
              <Text style={styles.cardTotal}>
                Rs. {Number(r.estimated_total || 0).toFixed(2)} · {r.item_count || 0} item(s)
              </Text>

              {/* Actions */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={async () => {
                    const full = await purchaseRequestsApi.get(r.id);
                    setViewPo(full);
                  }}
                  style={styles.actionBtn}
                >
                  <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
                  <Text style={styles.actionBtnText}>View</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleDownloadPdf(r)} style={styles.actionBtn}>
                  <Text style={[styles.actionBtnText, { color: colors.gold }]}>🖨️ PDF</Text>
                </TouchableOpacity>

                {canApprove && r.status === 'open' && (
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('Approve Purchase Order?', `Approve PO ${r.request_no} from ${r.supplier_name}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Approve', onPress: () => approveMutation.mutate(r.id) },
                      ])
                    }
                    style={[styles.actionBtn, { borderColor: colors.success, backgroundColor: '#F0FFF4' }]}
                  >
                    <Text style={[styles.actionBtnText, { color: colors.success }]}>✓ Approve</Text>
                  </TouchableOpacity>
                )}

                {r.status === 'open' && (
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('Cancel Purchase Order?', `Cancel PO ${r.request_no}?`, [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancelMutation.mutate(r.id) },
                      ])
                    }
                    style={[styles.actionBtn, { borderColor: colors.danger }]}
                  >
                    <Icon name="delete" size={14} color={colors.danger} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.danger }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Create PO Form Modal */}
      <CreatePoModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* View PO Detail Modal */}
      {viewPo && (
        <FormModal
          visible
          title={`PO: ${viewPo.request_no}`}
          onClose={() => setViewPo(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewPo(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="PO Number" value={viewPo.request_no} />
            <DetailRow label="Supplier" value={viewPo.supplier_name} />
            <DetailRow label="Route" value={viewPo.route_name || '-'} />
            <DetailRow label="Order Date" value={viewPo.request_date || viewPo.created_at || '-'} />
            <DetailRow label="Status" value={viewPo.status?.toUpperCase()} />
            <DetailRow label="Estimated Total" value={`Rs. ${Number(viewPo.estimated_total || 0).toFixed(2)}`} />
            <DetailRow label="Notes" value={viewPo.notes || '-'} />
          </View>

          <Text style={[styles.sectionHeader, { marginTop: 14, marginBottom: 6 }]}>Ordered Items</Text>
          <View style={styles.tableBox}>
            {(viewPo.items || []).map((it, idx) => (
              <View key={String(it.id || idx)} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.item_name || `Item #${it.item_id}`}</Text>
                  <Text style={styles.itemMeta}>Rate: Rs. {Number(it.rate || 0).toFixed(2)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.itemQty}>Qty: {it.qty}</Text>
                  <Text style={styles.itemTotal}>Rs. {(Number(it.qty || 0) * Number(it.rate || 0)).toFixed(2)}</Text>
                </View>
              </View>
            ))}
          </View>
        </FormModal>
      )}
    </View>
  );
}

function CreatePoModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list, enabled: visible });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list, enabled: visible });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list(''), enabled: visible });

  const [routeId, setRouteId] = useState(null);
  const [supplierId, setSupplierId] = useState(null);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ key: '1', item_id: null, qty: '1', rate: '' }]);
  const [error, setError] = useState('');

  const mappedSuppliersQuery = useQuery({
    queryKey: ['route-suppliers', routeId],
    queryFn: () => routeSuppliersApi.get(routeId),
    enabled: visible && !!routeId,
  });

  const allSuppliers = suppliersQuery.data || [];
  const mappedIds = mappedSuppliersQuery.data?.supplier_ids;
  const suppliers = routeId && mappedIds && mappedIds.length > 0 ? allSuppliers.filter((s) => mappedIds.includes(s.id)) : allSuppliers;

  const items = itemsQuery.data || [];
  const validLines = lines.filter((l) => l.item_id);
  const total = validLines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);

  const createMutation = useMutation({
    mutationFn: purchaseRequestsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      reset();
      onClose();
      Alert.alert('Success', 'Purchase Order generated successfully.');
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  const reset = () => {
    setRouteId(null);
    setSupplierId(null);
    setNotes('');
    setLines([{ key: '1', item_id: null, qty: '1', rate: '' }]);
    setError('');
  };

  const submit = () => {
    setError('');
    if (!supplierId) return setError('Please select a supplier.');
    if (validLines.length === 0) return setError('Please add at least one item.');
    createMutation.mutate({
      supplier_id: supplierId,
      route_id: routeId,
      notes: notes.trim() || null,
      items: validLines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), rate: Number(l.rate || 0) })),
    });
  };

  return (
    <FormModal
      visible={visible}
      title="New Purchase Order"
      onClose={() => { reset(); onClose(); }}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => { reset(); onClose(); }}>
            <Text style={formStyles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]}
            onPress={submit}
            disabled={createMutation.isPending}
          >
            <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Saving…' : 'Generate Order'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <SelectField label="Route (optional — filters suppliers)" value={routeId} options={routesQuery.data || []} onChange={(v) => { setRouteId(v); setSupplierId(null); }} />
      <SelectField label="Supplier *" required value={supplierId} options={suppliers} onChange={setSupplierId} />

      <Text style={formStyles.label}>Order Items</Text>
      <ItemLineEditor lines={lines} setLines={setLines} items={items} rateLabel="Purchase Rate" />

      <View style={styles.totalsBox}>
        <View style={[styles.totalRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Estimated Grand Total</Text>
          <Text style={styles.grandValue}>Rs. {total.toFixed(2)}</Text>
        </View>
      </View>

      <Text style={formStyles.label}>Notes / Instructions</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional instructions for supplier"
        placeholderTextColor={colors.inkMuted}
        style={formStyles.input}
      />

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

// =============================================================================
// B. GRN (GOODS RECEIVED NOTE) TAB
// =============================================================================
function GrnTab({ modalVisible, setModalVisible }) {
  const queryClient = useQueryClient();
  const canEdit = usePermission('purchases.edit_grn');
  const canDelete = usePermission('purchases.delete_grn');

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [viewGrn, setViewGrn] = useState(null);
  const [editingGrn, setEditingGrn] = useState(null);
  const [editPaid, setEditPaid] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');

  const purchasesQuery = useQuery({ queryKey: ['purchases'], queryFn: purchasesApi.list });
  const rows = purchasesQuery.data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const grn = (r.grn_no || '').toLowerCase();
      const sup = (r.supplier_name || '').toLowerCase();
      const inv = (r.supplier_invoice_no || '').toLowerCase();
      const mode = (r.payment_mode || '').toLowerCase();
      return grn.includes(q) || sup.includes(q) || inv.includes(q) || mode.includes(q);
    });
  }, [rows, search]);

  const removeMutation = useMutation({
    mutationFn: purchasesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      purchasesQuery.refetch();
      Alert.alert('Deleted', 'GRN deleted and inventory ledger updated.');
    },
    onError: (e) => Alert.alert('Delete Failed', friendlyErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => purchasesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setEditingGrn(null);
      Alert.alert('Updated', 'GRN details updated successfully.');
    },
    onError: (e) => setEditError(friendlyErrorMessage(e)),
  });

  const openEdit = async (grn) => {
    try {
      const full = await purchasesApi.get(grn.id);
      setEditingGrn(full);
      setEditPaid(String(full.paid_amount ?? '0'));
      setEditNotes(full.notes || full.supplier_invoice_no || '');
      setEditError('');
    } catch (e) {
      setEditingGrn(grn);
      setEditPaid(String(grn.paid_amount ?? '0'));
      setEditNotes(grn.notes || grn.supplier_invoice_no || '');
      setEditError('');
    }
  };

  const saveEdit = () => {
    if (!editingGrn) return;
    const paid = Number(editPaid || 0);
    const grand = Number(editingGrn.grand_total || 0);
    if (paid > grand) {
      setEditError(`Paid amount cannot exceed grand total (Rs. ${grand.toFixed(2)})`);
      return;
    }

    // Backend PUT /api/purchases/{id} requires { items: [...] } with valid item_id and qty
    const items = (editingGrn.items || []).map((it) => ({
      item_id: it.item_id,
      unit_id: it.unit_id ? Number(it.unit_id) : undefined,
      qty: Number(it.qty),
      free_qty: Number(it.free_qty || 0),
      mrp: it.mrp !== null && it.mrp !== undefined && it.mrp !== '' ? Number(it.mrp) : undefined,
      rate: Number(it.rate),
      discount_percent: Number(it.discount_percent || 0),
      discount_amount: Number(it.discount_amount || 0),
      tax_percent: Number(it.tax_percent || 0),
    }));

    if (items.length === 0) {
      setEditError('Cannot edit GRN: No line items found.');
      return;
    }

    updateMutation.mutate({
      id: editingGrn.id,
      data: {
        supplier_id: editingGrn.supplier_id,
        supplier_invoice_no: editNotes.trim() || editingGrn.supplier_invoice_no || null,
        payment_mode: editingGrn.payment_mode || 'credit',
        paid_amount: paid,
        items,
      },
    });
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.id));
    }
  };

  const grnColumns = {
    grn_no: 'GRN Number',
    supplier_name: 'Supplier',
    supplier_invoice_no: 'Invoice #',
    purchase_date: 'Date',
    grand_total: 'Grand Total',
    paid_amount: 'Paid Amount',
    pending_balance: 'Pending Balance',
    payment_mode: 'Payment Mode',
    status: 'Status',
  };

  const handleExportExcel = async (onlySelected = false) => {
    const targetRows = onlySelected
      ? filtered.filter((r) => selectedIds.includes(r.id))
      : filtered;

    if (targetRows.length === 0) {
      Alert.alert('Export', 'No records to export.');
      return;
    }
    setExportBusy(true);
    try {
      const b64 = buildXlsxBase64(grnColumns, targetRows, 'GRN_Records');
      await saveAndShareBase64(b64, 'grn_records.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (e) {
      Alert.alert('Export Error', friendlyErrorMessage(e));
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadPdf = async (singleGrn = null) => {
    setExportBusy(true);
    try {
      if (singleGrn) {
        const full = await purchasesApi.get(singleGrn.id);
        const reportData = {
          title: `Goods Received Note - ${full.grn_no}`,
          filtersText: `Supplier: ${full.supplier_name || '-'} | Invoice #: ${full.supplier_invoice_no || '-'} | Date: ${full.purchase_date || full.created_at || '-'}`,
          columns: { item_name: 'Item', qty: 'Received Qty', free_qty: 'Free Qty', rate: 'Rate', total: 'Net Amount' },
          rows: (full.items || []).map((it) => ({
            item_name: it.item_name || `Item #${it.item_id}`,
            qty: it.qty,
            free_qty: it.free_qty || 0,
            rate: `Rs. ${Number(it.rate || 0).toFixed(2)}`,
            total: `Rs. ${Number(it.line_total || it.net_amount || (it.qty * it.rate) || 0).toFixed(2)}`,
          })),
          totalsRow: {
            item_name: 'Total / Balance',
            qty: (full.items || []).reduce((s, it) => s + Number(it.qty || 0), 0),
            total: `Grand: Rs. ${Number(full.grand_total || 0).toFixed(2)} (Paid: Rs. ${Number(full.paid_amount || 0).toFixed(2)}, Due: Rs. ${Number(full.pending_balance || 0).toFixed(2)})`,
          },
        };
        await downloadReportPdf(reportData, `grn_${full.grn_no}.pdf`);
      } else {
        const targetRows = selectedIds.length > 0
          ? filtered.filter((r) => selectedIds.includes(r.id))
          : filtered;

        const reportData = {
          title: 'Goods Received Notes (GRN) Register',
          filtersText: `Total GRNs: ${targetRows.length}`,
          columns: grnColumns,
          rows: targetRows.map((r) => ({
            ...r,
            supplier_invoice_no: r.supplier_invoice_no || '-',
            grand_total: `Rs. ${Number(r.grand_total || 0).toFixed(2)}`,
            paid_amount: `Rs. ${Number(r.paid_amount || 0).toFixed(2)}`,
            pending_balance: `Rs. ${Number(r.pending_balance || 0).toFixed(2)}`,
          })),
        };
        await downloadReportPdf(reportData, 'grn_register.pdf');
      }
    } catch (e) {
      Alert.alert('PDF Error', friendlyErrorMessage(e));
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by GRN #, supplier, invoice #, mode..."
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Export Toolbar */}
      <View style={styles.exportToolbar}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleExportExcel(false)} disabled={exportBusy}>
          <Text style={styles.toolbarBtnText}>📊 Export Excel</Text>
        </TouchableOpacity>
        {selectedIds.length > 0 && (
          <TouchableOpacity style={[styles.toolbarBtn, { backgroundColor: colors.gold }]} onPress={() => handleExportExcel(true)} disabled={exportBusy}>
            <Text style={[styles.toolbarBtnText, { color: '#fff' }]}>Export Selected ({selectedIds.length})</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => handleDownloadPdf()} disabled={exportBusy}>
          <Text style={styles.toolbarBtnText}>📄 Download PDF</Text>
        </TouchableOpacity>
        {filtered.length > 0 && (
          <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
            <Text style={styles.selectAllBtnText}>
              {selectedIds.length === filtered.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={purchasesQuery.isFetching}
        onRefresh={purchasesQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No goods receipt notes (GRN) yet.</Text>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <Text style={styles.empty}>No GRNs found matching "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => {
          const isSelected = selectedIds.includes(r.id);
          return (
            <View style={[styles.card, isSelected && styles.cardSelected]}>
              <View style={styles.cardHeader}>
                <TouchableOpacity onPress={() => toggleSelect(r.id)} style={styles.checkboxTouch}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={styles.cardTitle}>{r.grn_no}</Text>
                </TouchableOpacity>
                <Text style={styles.status}>{r.payment_mode?.toUpperCase()}</Text>
              </View>

              <Text style={styles.cardMeta}>
                {r.supplier_name} {r.supplier_invoice_no ? `(Inv #${r.supplier_invoice_no})` : ''} · {r.purchase_date || r.created_at || 'Date N/A'}
              </Text>
              <Text style={styles.cardTotal}>
                Grand: Rs. {Number(r.grand_total || 0).toFixed(2)} · Due: Rs. {Number(r.pending_balance || 0).toFixed(2)}
              </Text>

              {/* Actions */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={async () => {
                    const full = await purchasesApi.get(r.id);
                    setViewGrn(full);
                  }}
                  style={styles.actionBtn}
                >
                  <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
                  <Text style={styles.actionBtnText}>View</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => handleDownloadPdf(r)} style={styles.actionBtn}>
                  <Text style={[styles.actionBtnText, { color: colors.gold }]}>🖨️ PDF</Text>
                </TouchableOpacity>

                {canEdit && (
                  <TouchableOpacity onPress={() => openEdit(r)} style={styles.actionBtn}>
                    <Icon name="edit" size={14} color={colors.gold} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.gold }]}>Edit</Text>
                  </TouchableOpacity>
                )}

                {canDelete && (
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        'Delete GRN?',
                        `Delete GRN ${r.grn_no}? This will safely reverse stock updates and ledger balances.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removeMutation.mutate(r.id) },
                        ]
                      )
                    }
                    style={styles.actionBtn}
                  >
                    <Icon name="delete" size={14} color={colors.danger} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      <GrnFormModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* View GRN Modal */}
      {viewGrn && (
        <FormModal
          visible
          title={`GRN: ${viewGrn.grn_no}`}
          onClose={() => setViewGrn(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewGrn(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="GRN Number" value={viewGrn.grn_no} />
            <DetailRow label="Supplier" value={viewGrn.supplier_name} />
            <DetailRow label="Invoice #" value={viewGrn.supplier_invoice_no || '-'} />
            <DetailRow label="Date" value={viewGrn.purchase_date || viewGrn.created_at || '-'} />
            <DetailRow label="Grand Total" value={`Rs. ${Number(viewGrn.grand_total || 0).toFixed(2)}`} />
            <DetailRow label="Paid Amount" value={`Rs. ${Number(viewGrn.paid_amount || 0).toFixed(2)}`} />
            <DetailRow label="Pending Balance" value={`Rs. ${Number(viewGrn.pending_balance || 0).toFixed(2)}`} />
            <DetailRow label="Payment Mode" value={viewGrn.payment_mode || 'Credit'} />
            <DetailRow label="Notes" value={viewGrn.notes || '-'} />
          </View>

          <Text style={[styles.sectionHeader, { marginTop: 14, marginBottom: 6 }]}>Received Line Items</Text>
          <View style={styles.tableBox}>
            {(viewGrn.items || []).map((it, idx) => (
              <View key={String(it.id || idx)} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.item_name || `Item #${it.item_id}`}</Text>
                  <Text style={styles.itemMeta}>Rate: Rs. {Number(it.rate || 0).toFixed(2)} {it.free_qty ? `(+${it.free_qty} free)` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.itemQty}>Qty: {it.qty}</Text>
                  <Text style={styles.itemTotal}>Rs. {Number(it.line_total || it.net_amount || (it.qty * it.rate) || 0).toFixed(2)}</Text>
                </View>
              </View>
            ))}
          </View>
        </FormModal>
      )}

      {/* Edit GRN Modal */}
      {editingGrn && (
        <FormModal
          visible
          title={`Edit GRN ${editingGrn.grn_no}`}
          onClose={() => setEditingGrn(null)}
          footer={
            <>
              <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => setEditingGrn(null)}>
                <Text style={formStyles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[formStyles.primaryBtn, updateMutation.isPending && formStyles.disabled]}
                onPress={saveEdit}
                disabled={updateMutation.isPending}
              >
                <Text style={formStyles.primaryBtnText}>{updateMutation.isPending ? 'Saving…' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </>
          }
        >
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: colors.inkMuted }}>Supplier: <Text style={{ fontWeight: '700', color: colors.ink }}>{editingGrn.supplier_name}</Text></Text>
            <Text style={{ fontSize: 13, color: colors.inkMuted, marginTop: 4 }}>Grand Total: <Text style={{ fontWeight: '700', color: colors.gold }}>Rs. {editingGrn.grand_total}</Text></Text>
          </View>

          <Text style={formStyles.label}>Paid Amount (Rs.) *</Text>
          <TextInput
            keyboardType="numeric"
            value={editPaid}
            onChangeText={(v) => { setEditError(''); setEditPaid(v); }}
            style={[formStyles.input, { color: colors.ink }]}
          />

          <Text style={formStyles.label}>Notes / Remarks</Text>
          <TextInput
            value={editNotes}
            onChangeText={setEditNotes}
            style={[formStyles.input, { color: colors.ink }]}
            placeholder="Optional remarks"
            placeholderTextColor={colors.inkMuted}
          />

          {editError ? <Text style={formStyles.error}>{editError}</Text> : null}
        </FormModal>
      )}
    </View>
  );
}

function GrnFormModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list, enabled: visible });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list(''), enabled: visible });

  const [supplierId, setSupplierId] = useState(null);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [paymentMode, setPaymentMode] = useState('credit');
  const [paidAmount, setPaidAmount] = useState('0');
  const [userEditedPaid, setUserEditedPaid] = useState(false);
  const emptyLine = () => ({ key: `${Date.now()}`, item_id: null, qty: '1', free_qty: '0', mrp: '', rate: '', discount_mode: 'percent', discount_percent: '0', discount_amount: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState('');

  const validLines = lines.filter((l) => l.item_id);
  const totalQty = validLines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalFreeQty = validLines.reduce((s, l) => s + Number(l.free_qty || 0), 0);
  const grossTotal = validLines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
  const totalDiscount = validLines.reduce((s, l) => {
    const gross = Number(l.qty || 0) * Number(l.rate || 0);
    const disc = l.discount_mode === 'amount' ? Number(l.discount_amount || 0) : gross * (Number(l.discount_percent || 0) / 100);
    return s + disc;
  }, 0);
  const total = Math.max(0, grossTotal - totalDiscount);
  const balanceAmount = Math.max(0, total - Number(paidAmount || 0));

  useEffect(() => {
    if (visible && !userEditedPaid) {
      setPaidAmount(paymentMode === 'credit' ? '0' : (total > 0 ? total.toFixed(2) : '0'));
    }
  }, [total, visible, userEditedPaid, paymentMode]);

  const createMutation = useMutation({
    mutationFn: purchasesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setSupplierId(null);
      setSupplierInvoiceNo('');
      setPaymentMode('credit');
      setPaidAmount('0');
      setUserEditedPaid(false);
      setLines([emptyLine()]);
      onClose();
      Alert.alert('Success', 'GRN created and stock updated successfully.');
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const handlePaidChange = (text) => {
    setUserEditedPaid(true);
    const num = Number(text || 0);
    if (num > total) {
      setPaidAmount(total > 0 ? String(total) : '0');
      setError(`Paid amount cannot exceed the net Grand Total (Rs. ${total.toFixed(2)})`);
    } else {
      setPaidAmount(text);
      setError('');
    }
  };

  const submit = () => {
    setError('');
    if (!supplierId) return setError('Select a supplier.');
    if (validLines.length === 0) return setError('Add at least one item.');
    if (Number(paidAmount || 0) > total) {
      return setError(`Paid amount cannot exceed net Grand Total (Rs. ${total.toFixed(2)})`);
    }
    createMutation.mutate({
      supplier_id: supplierId,
      supplier_invoice_no: supplierInvoiceNo.trim() || null,
      payment_mode: paymentMode,
      paid_amount: Number(paidAmount || 0),
      items: validLines.map((l) => ({
        item_id: l.item_id,
        qty: Number(l.qty),
        free_qty: Number(l.free_qty || 0),
        mrp: l.mrp !== '' ? Number(l.mrp) : undefined,
        rate: Number(l.rate || 0),
        ...(l.discount_mode === 'amount' ? { discount_amount: Number(l.discount_amount || 0) } : { discount_percent: Number(l.discount_percent || 0) }),
      })),
    });
  };

  const paymentModes = [
    { id: 'credit', name: 'Credit' },
    { id: 'cash', name: 'Cash' },
    { id: 'bank_transfer', name: 'Bank Transfer' },
  ];

  return (
    <FormModal
      visible={visible}
      title="New Goods Receipt (GRN)"
      onClose={onClose}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={onClose}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]} onPress={submit} disabled={createMutation.isPending}>
            <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Saving…' : 'Save GRN'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <SelectField label="Supplier *" required value={supplierId} options={suppliersQuery.data || []} onChange={setSupplierId} />

      <Text style={formStyles.label}>Supplier Invoice #</Text>
      <TextInput
        value={supplierInvoiceNo}
        onChangeText={setSupplierInvoiceNo}
        placeholder="e.g. INV-2024-001"
        placeholderTextColor={colors.inkMuted}
        style={[formStyles.input, { color: colors.ink }]}
      />

      <SelectField label="Payment Mode" value={paymentMode} options={paymentModes} onChange={setPaymentMode} />

      <Text style={styles.sectionHeader}>Received Items</Text>
      <GrnItemLineEditor lines={lines} setLines={setLines} items={itemsQuery.data || []} />

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Received Quantity</Text>
          <Text style={styles.summaryValue}>{totalQty} units {totalFreeQty > 0 ? `(+${totalFreeQty} free)` : ''}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Gross Total</Text>
          <Text style={styles.summaryValue}>Rs. {grossTotal.toFixed(2)}</Text>
        </View>
        {totalDiscount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.danger }]}>Total Discount</Text>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>- Rs. {totalDiscount.toFixed(2)}</Text>
          </View>
        )}
        <View style={[styles.summaryRow, styles.summaryDivider]}>
          <Text style={styles.summaryGrandLabel}>Net Grand Total</Text>
          <Text style={styles.summaryGrandValue}>Rs. {total.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Paid Amount</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>Rs. {Number(paidAmount || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Pending Balance</Text>
          <Text style={[styles.summaryValue, { color: balanceAmount > 0 ? colors.warning : colors.inkMuted }]}>
            Rs. {balanceAmount.toFixed(2)}
          </Text>
        </View>
      </View>

      <Text style={formStyles.label}>Paid Amount (Rs.)</Text>
      <TextInput
        keyboardType="numeric"
        value={paidAmount}
        onChangeText={handlePaidChange}
        placeholder="0.00"
        placeholderTextColor={colors.inkMuted}
        style={[formStyles.input, { color: colors.ink }]}
      />

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

// =============================================================================
// C. SUPPLIER PAYMENTS TAB
// =============================================================================
function PaymentsTab({ modalVisible, setModalVisible }) {
  const queryClient = useQueryClient();
  const canSettle = usePermission('purchases.settle_supplier_payment');
  const [search, setSearch] = useState('');
  const [viewPayment, setViewPayment] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editMode, setEditMode] = useState('cash');
  const [editRef, setEditRef] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');

  const paymentsQuery = useQuery({ queryKey: ['supplier-payments'], queryFn: supplierPaymentsApi.list });
  const rows = paymentsQuery.data || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => supplierPaymentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      setEditingPayment(null);
      Alert.alert('Updated', 'Payment details updated successfully.');
    },
    onError: (e) => setEditError(friendlyErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: supplierPaymentsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      paymentsQuery.refetch();
      Alert.alert('Deleted', 'Payment reversed successfully.');
    },
    onError: (e) => Alert.alert('Delete Failed', friendlyErrorMessage(e)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const code = (r.payment_code || '').toLowerCase();
      const sup = (r.supplier_name || '').toLowerCase();
      const mode = (r.payment_mode || '').toLowerCase();
      const ref = (r.reference_no || '').toLowerCase();
      const amt = String(r.amount || '');
      return code.includes(q) || sup.includes(q) || mode.includes(q) || ref.includes(q) || amt.includes(q);
    });
  }, [rows, search]);

  const openEdit = (p) => {
    setEditingPayment(p);
    setEditMode(p.payment_mode || 'cash');
    setEditRef(p.reference_no || '');
    setEditNotes(p.notes || '');
    setEditError('');
  };

  const saveEdit = () => {
    if (!editingPayment) return;
    updateMutation.mutate({
      id: editingPayment.id,
      data: {
        payment_mode: editMode,
        reference_no: editRef.trim() || null,
        notes: editNotes.trim() || null,
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by payment ID, supplier, mode..."
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={paymentsQuery.isFetching}
        onRefresh={paymentsQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No supplier payments yet.</Text>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <Text style={styles.empty}>No payments found matching "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{r.payment_code}</Text>
              <Text style={styles.status}>{r.payment_mode?.toUpperCase()}</Text>
            </View>
            <Text style={styles.cardMeta}>{r.supplier_name} · {r.paid_at || r.created_at || 'Date N/A'}</Text>
            <Text style={styles.cardTotal}>Rs. {Number(r.amount || 0).toFixed(2)}</Text>

            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => setViewPayment(r)} style={styles.actionBtn}>
                <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>View</Text>
              </TouchableOpacity>
              {canSettle && (
                <>
                  <TouchableOpacity onPress={() => openEdit(r)} style={styles.actionBtn}>
                    <Icon name="edit" size={14} color={colors.gold} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.gold }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        'Delete Payment?',
                        `Delete payment ${r.payment_code} of Rs. ${r.amount}? This will restore the supplier balance.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => removeMutation.mutate(r.id) },
                        ]
                      )
                    }
                    style={styles.actionBtn}
                  >
                    <Icon name="delete" size={14} color={colors.danger} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      />

      <SettlePaymentModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* View Modal */}
      {viewPayment && (
        <FormModal
          visible
          title={`Payment ${viewPayment.payment_code}`}
          onClose={() => setViewPayment(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewPayment(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Payment Code" value={viewPayment.payment_code} />
            <DetailRow label="Supplier" value={viewPayment.supplier_name} />
            <DetailRow label="Amount" value={`Rs. ${Number(viewPayment.amount || 0).toFixed(2)}`} />
            <DetailRow label="Mode" value={viewPayment.payment_mode?.toUpperCase()} />
            <DetailRow label="Date" value={viewPayment.paid_at || viewPayment.created_at || '-'} />
            <DetailRow label="Reference #" value={viewPayment.reference_no || '-'} />
            <DetailRow label="Notes" value={viewPayment.notes || '-'} />
          </View>
        </FormModal>
      )}

      {/* Edit Modal */}
      {editingPayment && (
        <FormModal
          visible
          title={`Edit Payment ${editingPayment.payment_code}`}
          onClose={() => setEditingPayment(null)}
          footer={
            <>
              <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => setEditingPayment(null)}>
                <Text style={formStyles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[formStyles.primaryBtn, updateMutation.isPending && formStyles.disabled]}
                onPress={saveEdit}
                disabled={updateMutation.isPending}
              >
                <Text style={formStyles.primaryBtnText}>{updateMutation.isPending ? 'Saving…' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </>
          }
        >
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: colors.inkMuted }}>Supplier: <Text style={{ fontWeight: '700', color: colors.ink }}>{editingPayment.supplier_name}</Text></Text>
            <Text style={{ fontSize: 13, color: colors.inkMuted, marginTop: 4 }}>Amount: <Text style={{ fontWeight: '700', color: colors.gold }}>Rs. {editingPayment.amount}</Text></Text>
          </View>

          <SelectField
            label="Payment Mode"
            value={editMode}
            options={[
              { id: 'cash', name: 'Cash' },
              { id: 'bank_transfer', name: 'Bank Transfer / UPI' },
              { id: 'cheque', name: 'Cheque' },
            ]}
            onChange={setEditMode}
          />

          <Text style={formStyles.label}>Reference / Transaction #</Text>
          <TextInput
            value={editRef}
            onChangeText={setEditRef}
            style={[formStyles.input, { color: colors.ink }]}
            placeholder="e.g. UTR / Cheque #"
            placeholderTextColor={colors.inkMuted}
          />

          <Text style={formStyles.label}>Notes</Text>
          <TextInput
            value={editNotes}
            onChangeText={setEditNotes}
            style={[formStyles.input, { color: colors.ink }]}
            placeholder="Optional notes"
            placeholderTextColor={colors.inkMuted}
          />

          {editError ? <Text style={formStyles.error}>{editError}</Text> : null}
        </FormModal>
      )}
    </View>
  );
}

function SettlePaymentModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list, enabled: visible });
  const [supplierId, setSupplierId] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const unpaidQuery = useQuery({
    queryKey: ['unpaid-grns', supplierId],
    queryFn: () => supplierPaymentsApi.unpaidGrns(supplierId),
    enabled: visible && !!supplierId,
  });

  const balancesQuery = useQuery({
    queryKey: ['supplier-balances'],
    queryFn: suppliersApi.balances,
    enabled: visible && !!supplierId,
  });

  const rawUnpaid = unpaidQuery.data;
  const unpaidList = Array.isArray(rawUnpaid) ? rawUnpaid : (rawUnpaid?.unpaid_grns || []);
  
  // Total pending: prioritize unpaid GRNs sum; if 0 check current_outstanding from supplier ledger
  const supplierBalance = (balancesQuery.data || []).find((b) => Number(b.id) === Number(supplierId));
  const unpaidGrnTotal = unpaidList.reduce((s, g) => s + Number(g.pending_balance || 0), 0);
  const totalDue = unpaidGrnTotal > 0 ? unpaidGrnTotal : Number(supplierBalance?.current_outstanding || 0);

  const createMutation = useMutation({
    mutationFn: supplierPaymentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-balances'] });
      reset();
      onClose();
      Alert.alert('Payment Recorded', 'Supplier payment settled successfully.');
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const reset = () => {
    setSupplierId(null);
    setAmount('');
    setPaymentMode('cash');
    setReferenceNo('');
    setNotes('');
    setError('');
  };

  const submit = () => {
    setError('');
    if (!supplierId) return setError('Select a supplier.');
    const num = Number(amount || 0);
    if (num <= 0) return setError('Enter a valid payment amount.');
    if (totalDue > 0 && num > totalDue + 0.009) {
      return setError(`Payment amount (${num.toFixed(2)}) exceeds this supplier's total pending balance of Rs. ${totalDue.toFixed(2)}.`);
    }
    createMutation.mutate({
      supplier_id: supplierId,
      amount: num,
      payment_mode: paymentMode,
      reference_no: referenceNo.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <FormModal
      visible={visible}
      title="Settle Supplier Payment"
      onClose={() => { reset(); onClose(); }}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => { reset(); onClose(); }}>
            <Text style={formStyles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]}
            onPress={submit}
            disabled={createMutation.isPending}
          >
            <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Saving…' : 'Record Payment'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <SelectField label="Supplier *" required value={supplierId} options={suppliersQuery.data || []} onChange={setSupplierId} />

      {supplierId ? (
        <View style={styles.dueBox}>
          <Text style={styles.dueLabel}>Outstanding Balance:</Text>
          <Text style={styles.dueValue}>Rs. {Number(totalDue).toFixed(2)}</Text>
          {unpaidList.length > 0 ? (
            <Text style={styles.dueHint}>{unpaidList.length} unpaid / partial GRN(s)</Text>
          ) : (
            <Text style={[styles.dueHint, { color: colors.success }]}>No pending GRNs for this supplier</Text>
          )}
        </View>
      ) : null}

      <Text style={formStyles.label}>Amount to Pay (Rs.) *</Text>
      <TextInput
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        placeholderTextColor={colors.inkMuted}
        style={[formStyles.input, { color: colors.ink }]}
      />

      <SelectField
        label="Payment Mode"
        value={paymentMode}
        options={[
          { id: 'cash', name: 'Cash' },
          { id: 'bank_transfer', name: 'Bank Transfer / UPI' },
          { id: 'cheque', name: 'Cheque' },
        ]}
        onChange={setPaymentMode}
      />

      <Text style={formStyles.label}>Reference / Transaction #</Text>
      <TextInput
        value={referenceNo}
        onChangeText={setReferenceNo}
        placeholder="e.g. UTR / Cheque #"
        placeholderTextColor={colors.inkMuted}
        style={[formStyles.input, { color: colors.ink }]}
      />

      <Text style={formStyles.label}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional remarks"
        placeholderTextColor={colors.inkMuted}
        style={[formStyles.input, { color: colors.ink }]}
      />

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

// =============================================================================
// MAIN PURCHASING SCREEN
// =============================================================================
export function PurchasingScreen() {
  const canManagePo = usePermission('orders.create_purchase_indent');
  const canManageGrn = usePermission('purchases.create_grn');
  const canSettlePayment = usePermission('purchases.settle_supplier_payment');

  const [tab, setTab] = useState('orders'); // 'orders' | 'grn' | 'payments'
  const [modalVisible, setModalVisible] = useState(false);

  const canCreate = tab === 'orders' ? canManagePo : tab === 'grn' ? canManageGrn : canSettlePayment;

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <SegmentedTabs
          tabs={[
            { key: 'orders', label: 'Purchase Orders' },
            { key: 'grn', label: 'Goods Receipt (GRN)' },
            { key: 'payments', label: 'Supplier Payments' },
          ]}
          active={tab}
          onChange={(t) => { setTab(t); setModalVisible(false); }}
          style={{ marginHorizontal: 12, marginTop: 8, marginBottom: 8 }}
        />
        {canCreate && (
          <View style={styles.topActionRow}>
            <TouchableOpacity style={styles.topRightBtn} onPress={() => setModalVisible(true)}>
              <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 6 }} />
              <Text style={styles.topRightBtnText}>
                {tab === 'orders' ? '+ New Purchase Order' : tab === 'grn' ? '+ New GRN' : '+ Settle Payment'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={{ flex: 1, marginTop: 4 }}>
        {tab === 'orders' && <PurchaseOrderTab modalVisible={modalVisible} setModalVisible={setModalVisible} />}
        {tab === 'grn' && <GrnTab modalVisible={modalVisible} setModalVisible={setModalVisible} />}
        {tab === 'payments' && <PaymentsTab modalVisible={modalVisible} setModalVisible={setModalVisible} />}
      </View>
    </View>
  );
}

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
  topHeader: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingBottom: 6,
  },
  topActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  topRightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navbar,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  topRightBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.ink, paddingVertical: 6 },
  clearSearchBtn: { padding: 6 },
  clearSearchText: { color: colors.inkMuted, fontSize: 14, fontWeight: '700' },
  resetSearchBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.navbar,
  },
  resetSearchBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  exportToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    alignItems: 'center',
  },
  toolbarBtn: {
    backgroundColor: colors.navbar,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toolbarBtnText: { color: colors.gold, fontWeight: '700', fontSize: 11 },
  selectAllBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  selectAllBtnText: { color: colors.inkMuted, fontWeight: '600', fontSize: 11 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardSelected: {
    borderColor: colors.gold,
    backgroundColor: '#FFFDF5',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  checkboxTouch: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkboxTick: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardTitle: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  status: { fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
  cardMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  cardTotal: { fontWeight: '700', color: colors.ink, marginTop: 6, fontSize: 13 },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  actionBtnText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: colors.gold, marginVertical: 6, textTransform: 'uppercase' },
  totalsBox: { backgroundColor: colors.page, borderRadius: 8, padding: 10, marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { fontSize: 12, color: colors.inkMuted },
  totalValue: { fontSize: 12, color: colors.ink, fontWeight: '600' },
  grandRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: 4, paddingTop: 4 },
  grandLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  grandValue: { fontSize: 13, fontWeight: '800', color: colors.gold },
  summaryCard: { backgroundColor: colors.page, borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: colors.borderSoft },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  summaryValue: { fontSize: 12, color: colors.ink, fontWeight: '700' },
  summaryDivider: { borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: 6, paddingTop: 6 },
  summaryGrandLabel: { fontSize: 13, color: colors.ink, fontWeight: '800' },
  summaryGrandValue: { fontSize: 14, color: colors.gold, fontWeight: '800' },
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 13 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  tableBox: { backgroundColor: colors.page, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.borderSoft },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  itemName: { fontSize: 12, fontWeight: '700', color: colors.ink },
  itemMeta: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  itemQty: { fontSize: 12, fontWeight: '600', color: colors.ink },
  itemTotal: { fontSize: 12, fontWeight: '700', color: colors.gold, marginTop: 2 },
  dueBox: { backgroundColor: '#FFFDF5', borderRadius: 8, padding: 10, marginVertical: 8, borderWidth: 1, borderColor: colors.borderSoft },
  dueLabel: { fontSize: 11, color: colors.inkMuted, fontWeight: '600' },
  dueValue: { fontSize: 16, color: colors.danger, fontWeight: '800', marginVertical: 2 },
  dueHint: { fontSize: 11, color: colors.inkMuted },
});
