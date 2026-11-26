import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesReturnsApi, purchaseReturnsApi } from '../../api/postsale';
import { customersApi, suppliersApi } from '../../api/parties';
import { itemsApi } from '../../api/catalog';
import { invoicesApi } from '../../api/invoices';
import { purchasesApi } from '../../api/purchasing';
import { friendlyErrorMessage } from '../../api/client';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { ItemLineEditor } from '../../components/ItemLineEditor';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

const emptyLines = () => [{ key: `${Date.now()}`, item_id: null, qty: '1', rate: '0' }];

/**
 * Shows the original invoice/GRN's real lines with what's already been
 * returned and what's left, so the user picks a quantity instead of
 * re-typing an item/rate that's already known. `linkField` distinguishes
 * invoice_item_id (Sales Return) from purchase_item_id (Purchase Return).
 */
function TraceableReturnLines({ returnableItems, quantities, setQuantities, linkField, sourceLabel }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={formStyles.label}>Items on this {sourceLabel}</Text>
      {returnableItems.map((row) => {
        const lineId = row[linkField];
        const remaining = Number(row.remaining_qty);
        return (
          <View key={lineId} style={traceStyles.row}>
            <View style={{ flex: 1 }}>
              <Text style={traceStyles.itemName}>{row.item_name}</Text>
              <Text style={traceStyles.itemMeta}>
                Original {row.original_qty} · Returned {row.already_returned_qty} · Remaining {remaining} @ Rs.{row.rate}
              </Text>
            </View>
            <TextInput
              keyboardType="numeric"
              editable={remaining > 0}
              value={quantities[lineId] ?? ''}
              onChangeText={(v) => setQuantities((prev) => ({ ...prev, [lineId]: v }))}
              placeholder="Qty"
              style={[traceStyles.qtyInput, remaining <= 0 && traceStyles.qtyInputDisabled]}
            />
          </View>
        );
      })}
      {returnableItems.length === 0 && <Text style={traceStyles.empty}>No lines found on this record.</Text>}
    </View>
  );
}

/** Auto-follows the computed return total until the user types their own amount (partial refund). */
function RefundAmountField({ returnTotal, refundAmount, setRefundAmount, touched, setTouched }) {
  useEffect(() => {
    if (!touched) setRefundAmount(returnTotal ? returnTotal.toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnTotal, touched]);

  const balance = returnTotal - Number(refundAmount || 0);

  return (
    <View>
      <Text style={traceStyles.itemMeta}>Return Total: Rs. {returnTotal.toFixed(2)}</Text>
      <Text style={formStyles.label}>Refund / Payment Amount</Text>
      <TextInput
        keyboardType="numeric"
        value={refundAmount}
        onChangeText={(v) => { setTouched(true); setRefundAmount(v); }}
        style={formStyles.input}
      />
      {balance > 0.009 && <Text style={traceStyles.balanceWarning}>Balance not refunded: Rs. {balance.toFixed(2)}</Text>}
    </View>
  );
}

const traceStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, padding: 10, marginBottom: 6, backgroundColor: colors.card },
  itemName: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  itemMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  qtyInput: { width: 64, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, padding: 8, marginLeft: 8, textAlign: 'center' },
  qtyInputDisabled: { opacity: 0.4 },
  empty: { color: colors.inkMuted, fontSize: 12, textAlign: 'center', padding: 12 },
  balanceWarning: { color: '#D97706', fontSize: 11, marginTop: 4, fontWeight: '600' },
});

function SalesReturnFormModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list, enabled: visible });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list(''), enabled: visible });
  const [invoiceId, setInvoiceId] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [refundAction, setRefundAction] = useState('credit_note');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState(emptyLines());
  const [quantities, setQuantities] = useState({});
  const [refundAmount, setRefundAmount] = useState('');
  const [refundTouched, setRefundTouched] = useState(false);
  const [error, setError] = useState('');

  const returnableQuery = useQuery({
    queryKey: ['invoice-returnable-items', invoiceId],
    queryFn: () => invoicesApi.returnableItems(invoiceId),
    enabled: visible && !!invoiceId,
  });
  const returnableItems = useMemo(() => (invoiceId ? (returnableQuery.data || []) : null), [invoiceId, returnableQuery.data]);

  const reset = () => {
    setInvoiceId(''); setCustomerId(null); setRefundAction('credit_note'); setReason('');
    setLines(emptyLines()); setQuantities({}); setRefundAmount(''); setRefundTouched(false);
  };

  const createMutation = useMutation({
    mutationFn: salesReturnsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
      reset();
      onClose();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const traceableLines = useMemo(() => {
    if (!returnableItems) return [];
    return returnableItems
      .map((row) => ({ item_id: row.item_id, invoice_item_id: row.invoice_item_id, qty: Number(quantities[row.invoice_item_id] || 0), rate: Number(row.rate) }))
      .filter((l) => l.qty > 0);
  }, [returnableItems, quantities]);
  const manualLines = useMemo(() => lines.filter((l) => l.item_id), [lines]);
  const activeLines = invoiceId ? traceableLines : manualLines;
  const returnTotal = useMemo(() => activeLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0), [activeLines]);

  const submit = () => {
    setError('');
    if (activeLines.length === 0) return setError('Add at least one return item with a quantity.');
    createMutation.mutate({
      invoice_id: invoiceId ? Number(invoiceId) : null,
      customer_id: customerId,
      refund_action: refundAction,
      reason: reason || null,
      refund_amount: refundAmount !== '' ? Number(refundAmount) : undefined,
      items: activeLines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), rate: Number(l.rate), invoice_item_id: l.invoice_item_id })),
    });
  };

  return (
    <FormModal
      visible={visible} title="New Sales Return" onClose={onClose}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={onClose}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]} onPress={submit} disabled={createMutation.isPending}>
            <Text style={formStyles.primaryBtnText}>Save Return</Text>
          </TouchableOpacity>
        </>
      }
    >
      <Text style={formStyles.label}>Invoice # (optional — pulls the real items/quantities)</Text>
      <TextInput
        value={invoiceId}
        onChangeText={(v) => { setInvoiceId(v); setQuantities({}); setRefundTouched(false); }}
        keyboardType="numeric" style={formStyles.input} placeholder="Invoice #"
      />
      {invoiceId && returnableQuery.isError && <Text style={formStyles.error}>Could not load that invoice — check the Invoice #.</Text>}
      <SelectField label="Customer" value={customerId} options={customersQuery.data || []} labelKey="ledger_name" onChange={setCustomerId} placeholder="Walk-in / Unknown Customer" />
      <SelectField
        label="Refund Action"
        value={refundAction}
        options={[{ id: 'credit_note', name: 'Credit Note' }, { id: 'cash_refund', name: 'Cash Refund' }]}
        onChange={setRefundAction}
      />
      <Text style={formStyles.label}>Return Reason</Text>
      <TextInput value={reason} onChangeText={setReason} style={formStyles.input} placeholder="Defective, size mismatch, changed mind..." />

      {invoiceId ? (
        <TraceableReturnLines returnableItems={returnableItems || []} quantities={quantities} setQuantities={setQuantities} linkField="invoice_item_id" sourceLabel="invoice" />
      ) : (
        <>
          <Text style={formStyles.label}>Return Item Lines *</Text>
          <ItemLineEditor lines={lines} setLines={setLines} items={itemsQuery.data || []} />
        </>
      )}

      <RefundAmountField returnTotal={returnTotal} refundAmount={refundAmount} setRefundAmount={setRefundAmount} touched={refundTouched} setTouched={setRefundTouched} />

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

function PurchaseReturnFormModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list, enabled: visible });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list(''), enabled: visible });
  const [purchaseId, setPurchaseId] = useState('');
  const [supplierId, setSupplierId] = useState(null);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState(emptyLines());
  const [quantities, setQuantities] = useState({});
  const [refundAmount, setRefundAmount] = useState('');
  const [refundTouched, setRefundTouched] = useState(false);
  const [error, setError] = useState('');

  const returnableQuery = useQuery({
    queryKey: ['purchase-returnable-items', purchaseId],
    queryFn: () => purchasesApi.returnableItems(purchaseId),
    enabled: visible && !!purchaseId,
  });
  const returnableItems = useMemo(() => (purchaseId ? (returnableQuery.data || []) : null), [purchaseId, returnableQuery.data]);

  const reset = () => {
    setPurchaseId(''); setSupplierId(null); setReason('');
    setLines(emptyLines()); setQuantities({}); setRefundAmount(''); setRefundTouched(false);
  };

  const createMutation = useMutation({
    mutationFn: purchaseReturnsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-returns'] });
      reset();
      onClose();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const traceableLines = useMemo(() => {
    if (!returnableItems) return [];
    return returnableItems
      .map((row) => ({ item_id: row.item_id, purchase_item_id: row.purchase_item_id, qty: Number(quantities[row.purchase_item_id] || 0), rate: Number(row.rate) }))
      .filter((l) => l.qty > 0);
  }, [returnableItems, quantities]);
  const manualLines = useMemo(() => lines.filter((l) => l.item_id), [lines]);
  const activeLines = purchaseId ? traceableLines : manualLines;
  const returnTotal = useMemo(() => activeLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0), [activeLines]);

  const submit = () => {
    setError('');
    if (!supplierId) return setError('Select a supplier.');
    if (activeLines.length === 0) return setError('Add at least one return item with a quantity.');
    createMutation.mutate({
      purchase_id: purchaseId ? Number(purchaseId) : null,
      supplier_id: supplierId,
      reason: reason || null,
      refund_amount: refundAmount !== '' ? Number(refundAmount) : undefined,
      items: activeLines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), rate: Number(l.rate), purchase_item_id: l.purchase_item_id })),
    });
  };

  return (
    <FormModal
      visible={visible} title="New Purchase Return" onClose={onClose}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={onClose}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]} onPress={submit} disabled={createMutation.isPending}>
            <Text style={formStyles.primaryBtnText}>Save Return</Text>
          </TouchableOpacity>
        </>
      }
    >
      <Text style={formStyles.label}>Purchase / GRN # (optional — pulls the real items/quantities)</Text>
      <TextInput
        value={purchaseId}
        onChangeText={(v) => { setPurchaseId(v); setQuantities({}); setRefundTouched(false); }}
        keyboardType="numeric" style={formStyles.input} placeholder="Purchase #"
      />
      {purchaseId && returnableQuery.isError && <Text style={formStyles.error}>Could not load that purchase — check the ID.</Text>}
      <SelectField label="Supplier *" required value={supplierId} options={suppliersQuery.data || []} onChange={setSupplierId} />
      <Text style={formStyles.label}>Return Reason</Text>
      <TextInput value={reason} onChangeText={setReason} style={formStyles.input} placeholder="Damaged batch, expired goods, wrong delivery..." />

      {purchaseId ? (
        <TraceableReturnLines returnableItems={returnableItems || []} quantities={quantities} setQuantities={setQuantities} linkField="purchase_item_id" sourceLabel="GRN" />
      ) : (
        <>
          <Text style={formStyles.label}>Return Item Lines *</Text>
          <ItemLineEditor lines={lines} setLines={setLines} items={itemsQuery.data || []} />
        </>
      )}

      <RefundAmountField returnTotal={returnTotal} refundAmount={refundAmount} setRefundAmount={setRefundAmount} touched={refundTouched} setTouched={setRefundTouched} />

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

function getReturnTotal(r) {
  return Number(r?.refund_amount ?? 0).toFixed(2);
}

function SalesReturnsTab({ modalVisible, setModalVisible }) {
  const canApprove = usePermission('returns.approve_untraceable_return');
  const [viewReturn, setViewReturn] = useState(null);
  const [search, setSearch] = useState('');
  const listQuery = useQuery({ queryKey: ['sales-returns'], queryFn: salesReturnsApi.list });
  const queryClient = useQueryClient();

  const filteredData = useMemo(() => {
    const list = listQuery.data || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      (r.return_no || '').toLowerCase().includes(q) ||
      (r.customer_name || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q) ||
      (r.refund_action || '').toLowerCase().includes(q) ||
      String(r.refund_amount || '').toLowerCase().includes(q)
    );
  }, [listQuery.data, search]);

  const approveMutation = useMutation({
    mutationFn: salesReturnsApi.approve,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-returns'] }),
  });
  const rejectMutation = useMutation({
    mutationFn: salesReturnsApi.reject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales-returns'] }),
  });

  return (
    <>
      <View style={styles.searchWrap}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by return #, customer, reason..."
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="close" size={14} color={colors.inkMuted} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filteredData}
        keyExtractor={(r) => String(r.id)}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
        ListEmptyComponent={<Text style={styles.empty}>{search ? 'No matching returns found.' : 'No sales returns yet.'}</Text>}
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{r.return_no}</Text>
              <Text style={styles.cardMeta}>{r.customer_name || 'Walk-in'} · {r.status}</Text>
              <Text style={styles.cardTotal}>Rs. {getReturnTotal(r)}</Text>
            </View>
            <View style={{ gap: 6 }}>
              <TouchableOpacity onPress={() => setViewReturn(r)} style={styles.actionBtn}>
                <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>View</Text>
              </TouchableOpacity>
              {canApprove && r.status === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity onPress={() => approveMutation.mutate(r.id)} style={styles.approveBtn}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => rejectMutation.mutate(r.id)} style={styles.rejectBtn}>
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      />
      <SalesReturnFormModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {viewReturn && (
        <FormModal
          visible title={`Sales Return: ${viewReturn.return_no}`} onClose={() => setViewReturn(null)}
          footer={<TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewReturn(null)}><Text style={formStyles.primaryBtnText}>Close</Text></TouchableOpacity>}
        >
          <View style={styles.detailBox}>
            <DetailRow label="Return No" value={viewReturn.return_no} />
            <DetailRow label="Customer" value={viewReturn.customer_name || 'Walk-in'} />
            <DetailRow label="Refund Action" value={viewReturn.refund_action || '-'} />
            <DetailRow label="Reason" value={viewReturn.reason || '-'} />
            <DetailRow label="Return Total" value={`Rs. ${Number(viewReturn.return_total ?? 0).toFixed(2)}`} />
            <DetailRow label="Refunded" value={`Rs. ${getReturnTotal(viewReturn)}`} />
            <DetailRow label="Balance" value={`Rs. ${Number(viewReturn.balance_amount ?? 0).toFixed(2)}`} />
            <DetailRow label="Status" value={viewReturn.status} />
          </View>
        </FormModal>
      )}
    </>
  );
}

function PurchaseReturnsTab({ modalVisible, setModalVisible }) {
  const [viewReturn, setViewReturn] = useState(null);
  const [search, setSearch] = useState('');
  const listQuery = useQuery({ queryKey: ['purchase-returns'], queryFn: purchaseReturnsApi.list });

  const filteredData = useMemo(() => {
    const list = listQuery.data || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      (r.return_no || '').toLowerCase().includes(q) ||
      (r.supplier_name || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q) ||
      String(r.refund_amount || '').toLowerCase().includes(q)
    );
  }, [listQuery.data, search]);

  return (
    <>
      <View style={styles.searchWrap}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by return #, supplier, reason..."
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="close" size={14} color={colors.inkMuted} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filteredData}
        keyExtractor={(r) => String(r.id)}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
        ListEmptyComponent={<Text style={styles.empty}>{search ? 'No matching returns found.' : 'No purchase returns yet.'}</Text>}
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{r.return_no}</Text>
              <Text style={styles.cardMeta}>{r.supplier_name}</Text>
              <Text style={styles.cardTotal}>Rs. {getReturnTotal(r)}</Text>
            </View>
            <TouchableOpacity onPress={() => setViewReturn(r)} style={styles.actionBtn}>
              <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
              <Text style={styles.actionBtnText}>View</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <PurchaseReturnFormModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {viewReturn && (
        <FormModal
          visible title={`Purchase Return: ${viewReturn.return_no}`} onClose={() => setViewReturn(null)}
          footer={<TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewReturn(null)}><Text style={formStyles.primaryBtnText}>Close</Text></TouchableOpacity>}
        >
          <View style={styles.detailBox}>
            <DetailRow label="Return No" value={viewReturn.return_no} />
            <DetailRow label="Supplier" value={viewReturn.supplier_name} />
            <DetailRow label="Reason" value={viewReturn.reason || '-'} />
            <DetailRow label="Return Total" value={`Rs. ${Number(viewReturn.return_total ?? 0).toFixed(2)}`} />
            <DetailRow label="Refunded" value={`Rs. ${getReturnTotal(viewReturn)}`} />
            <DetailRow label="Balance" value={`Rs. ${Number(viewReturn.balance_amount ?? 0).toFixed(2)}`} />
            <DetailRow label="Status" value={viewReturn.status} />
          </View>
        </FormModal>
      )}
    </>
  );
}
        >
          <View style={styles.detailBox}>
            <DetailRow label="Return No" value={viewReturn.return_no} />
            <DetailRow label="Supplier" value={viewReturn.supplier_name} />
            <DetailRow label="Reason" value={viewReturn.reason || '-'} />
            <DetailRow label="Return Total" value={`Rs. ${Number(viewReturn.return_total ?? 0).toFixed(2)}`} />
            <DetailRow label="Refunded" value={`Rs. ${getReturnTotal(viewReturn)}`} />
            <DetailRow label="Balance" value={`Rs. ${Number(viewReturn.balance_amount ?? 0).toFixed(2)}`} />
          </View>
        </FormModal>
      )}
    </>
  );
}

export function ReturnsScreen() {
  const canSalesReturn = usePermission('returns.sales_return');
  const canPurchaseReturn = usePermission('returns.purchase_return');
  const [tab, setTab] = useState('sales');
  const [modalVisible, setModalVisible] = useState(false);

  const canCreate = tab === 'sales' ? canSalesReturn : canPurchaseReturn;

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <SegmentedTabs tabs={[{ key: 'sales', label: 'Sales Returns' }, { key: 'purchase', label: 'Purchase Returns' }]} active={tab} onChange={setTab} />
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.topRightBtn} onPress={() => setModalVisible(true)}>
            <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
            <Text style={styles.topRightBtnText}>New</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flex: 1, marginTop: 4 }}>
        {tab === 'sales'
          ? <SalesReturnsTab modalVisible={modalVisible} setModalVisible={setModalVisible} />
          : <PurchaseReturnsTab modalVisible={modalVisible} setModalVisible={setModalVisible} />}
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
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, marginHorizontal: 12, marginTop: 10, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft },
  searchInput: { flex: 1, padding: 0, fontSize: 13, color: colors.ink },
  topHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  topRightBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.navbar, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 8 },
  topRightBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.borderSoft },
  cardTitle: { fontWeight: '700', color: colors.ink },
  cardMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  cardTotal: { fontWeight: '700', color: colors.ink, marginTop: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.borderSoft },
  actionBtnText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  approveBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: colors.success },
  approveBtnText: { color: colors.success, fontWeight: '700', fontSize: 11 },
  rejectBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: colors.danger },
  rejectBtnText: { color: colors.danger, fontWeight: '700', fontSize: 11 },
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 13 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 13 },
});
