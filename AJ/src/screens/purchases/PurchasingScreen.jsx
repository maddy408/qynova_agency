import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesApi, supplierPaymentsApi } from '../../api/purchasing';
import { suppliersApi } from '../../api/parties';
import { itemsApi } from '../../api/catalog';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { GrnItemLineEditor } from '../../components/GrnItemLineEditor';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

function GrnFormModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list, enabled: visible });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list(''), enabled: visible });
  const [supplierId, setSupplierId] = useState(null);
  const [paidAmount, setPaidAmount] = useState('0');
  const [userEditedPaid, setUserEditedPaid] = useState(false);
  const emptyLine = () => ({ key: `${Date.now()}`, item_id: null, qty: '1', free_qty: '0', mrp: '', rate: '', discount_mode: 'percent', discount_percent: '0', discount_amount: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState('');

  const validLines = lines.filter((l) => l.item_id);
  const total = validLines.reduce((s, l) => {
    const gross = Number(l.qty || 0) * Number(l.rate || 0);
    const disc = l.discount_mode === 'amount' ? Number(l.discount_amount || 0) : gross * (Number(l.discount_percent || 0) / 100);
    return s + Math.max(gross - disc, 0);
  }, 0);

  useEffect(() => {
    if (visible && !userEditedPaid) {
      setPaidAmount(total > 0 ? total.toFixed(2) : '0');
    }
  }, [total, visible, userEditedPaid]);

  const createMutation = useMutation({
    mutationFn: purchasesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setSupplierId(null); setPaidAmount('0'); setUserEditedPaid(false); setLines([emptyLine()]);
      onClose();
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
      payment_mode: 'credit',
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

  return (
    <FormModal
      visible={visible} title="New GRN (Goods Received)" onClose={onClose}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={onClose}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]} onPress={submit} disabled={createMutation.isPending}>
            <Text style={formStyles.primaryBtnText}>Save GRN</Text>
          </TouchableOpacity>
        </>
      }
    >
      <SelectField label="Supplier" required value={supplierId} options={suppliersQuery.data || []} onChange={setSupplierId} />
      <Text style={formStyles.label}>Items</Text>
      <GrnItemLineEditor lines={lines} setLines={setLines} items={itemsQuery.data || []} />
      <Text style={formStyles.label}>Paid Amount (Max Rs. {total.toFixed(2)})</Text>
      <TextInput keyboardType="numeric" value={paidAmount} onChangeText={handlePaidChange} style={formStyles.input} />
      <Text style={styles.total}>Grand Total: Rs. {total.toFixed(2)}</Text>
      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

function SupplierPaymentFormModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list, enabled: visible });
  const [supplierId, setSupplierId] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: supplierPaymentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      setSupplierId(null); setAmount(''); setError('');
      onClose();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const submit = () => {
    setError('');
    if (!supplierId || !amount) return setError('Select a supplier and enter payment amount.');
    createMutation.mutate({ supplier_id: supplierId, amount: Number(amount), payment_mode: paymentMode });
  };

  return (
    <FormModal
      visible={visible}
      title="Settle Supplier Payment"
      onClose={onClose}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={onClose}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]} onPress={submit} disabled={createMutation.isPending}>
            <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Saving…' : 'Save Payment'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <SelectField label="Supplier *" required value={supplierId} options={suppliersQuery.data || []} onChange={setSupplierId} />
      <Text style={formStyles.label}>Payment Amount (Rs.) *</Text>
      <TextInput keyboardType="numeric" value={amount} onChangeText={setAmount} style={formStyles.input} placeholder="0.00" />
      <SelectField
        label="Payment Mode"
        value={paymentMode}
        options={[{ id: 'cash', name: 'Cash' }, { id: 'bank_transfer', name: 'Bank Transfer / UPI' }, { id: 'cheque', name: 'Cheque' }]}
        onChange={setPaymentMode}
      />
      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

function GrnTab({ modalVisible, setModalVisible }) {
  const queryClient = useQueryClient();
  const canEdit = usePermission('purchases.edit_grn') || usePermission('purchases.create_grn');
  const canDelete = usePermission('purchases.delete_grn') || usePermission('purchases.create_grn');

  const [search, setSearch] = useState('');
  const [viewGrn, setViewGrn] = useState(null);
  const [editingGrn, setEditingGrn] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editPaid, setEditPaid] = useState('');
  const [editError, setEditError] = useState('');

  const listQuery = useQuery({ queryKey: ['purchases'], queryFn: purchasesApi.list });
  const rows = useMemo(() => listQuery.data || [], [listQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => purchasesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setEditingGrn(null);
    },
    onError: (e) => setEditError(friendlyErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: purchasesApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchases'] }),
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const num = (r.grn_no || '').toLowerCase();
      const sup = (r.supplier_name || '').toLowerCase();
      const st = (r.status || '').toLowerCase();
      const tot = String(r.grand_total || '');
      return num.includes(q) || sup.includes(q) || st.includes(q) || tot.includes(q);
    });
  }, [rows, search]);

  const openEdit = (grn) => {
    setEditingGrn(grn);
    setEditNotes(grn.notes || '');
    setEditPaid(String(grn.paid_amount || '0'));
    setEditError('');
  };

  const saveEdit = () => {
    if (!editingGrn) return;
    const numPaid = Number(editPaid || 0);
    const maxPaid = Number(editingGrn.grand_total || 0);
    if (isNaN(numPaid) || numPaid < 0) {
      setEditError('Paid amount must be a non-negative number.');
      return;
    }
    if (numPaid > maxPaid) {
      setEditError(`Paid amount cannot exceed grand total of Rs. ${maxPaid.toFixed(2)}`);
      return;
    }
    updateMutation.mutate({
      id: editingGrn.id,
      data: {
        notes: editNotes.trim(),
        paid_amount: numPaid,
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* GRN Search Bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by GRN #, supplier, status..."
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
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No GRNs yet.</Text>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <Text style={styles.empty}>No GRNs found matching "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{r.grn_no}</Text>
              <Text style={[styles.status, r.status === 'received' && { color: colors.success }]}>{r.status}</Text>
            </View>
            <Text style={styles.cardMeta}>{r.supplier_name} · {r.purchase_date || r.created_at || 'Date N/A'}</Text>
            <Text style={styles.cardTotal}>Rs. {r.grand_total} · Pending Rs. {r.pending_balance || 0}</Text>

            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => setViewGrn(r)} style={styles.actionBtn}>
                <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>View</Text>
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
                      `Delete GRN ${r.grn_no}? This will safely reverse added stock and ledger updates.`,
                      [
                        { text: 'Cancel' },
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
        )}
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
            <DetailRow label="Date" value={viewGrn.purchase_date || viewGrn.created_at || '-'} />
            <DetailRow label="Status" value={viewGrn.status} />
            <DetailRow label="Grand Total" value={`Rs. ${viewGrn.grand_total}`} />
            <DetailRow label="Paid Amount" value={`Rs. ${viewGrn.paid_amount || 0}`} />
            <DetailRow label="Pending Balance" value={`Rs. ${viewGrn.pending_balance || 0}`} />
            <DetailRow label="Payment Mode" value={viewGrn.payment_mode || 'Credit'} />
            <DetailRow label="Supplier Invoice #" value={viewGrn.supplier_invoice_no || '-'} />
            <DetailRow label="Notes" value={viewGrn.notes || '-'} />
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
            placeholder="GRN remarks"
            placeholderTextColor={colors.inkMuted}
          />

          {editError ? <Text style={formStyles.error}>{editError}</Text> : null}
        </FormModal>
      )}
    </View>
  );
}

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
  const rows = useMemo(() => paymentsQuery.data || [], [paymentsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => supplierPaymentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
      setEditingPayment(null);
    },
    onError: (e) => setEditError(friendlyErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: supplierPaymentsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplier-payments'] }),
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
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
      {/* Supplier Payment Search Bar */}
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
                        `Delete payment ${r.payment_code} of Rs. ${r.amount}? This will safely restore the supplier's pending balance.`,
                        [
                          { text: 'Cancel' },
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
      <SupplierPaymentFormModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* View Payment Modal */}
      {viewPayment && (
        <FormModal
          visible
          title={`Payment: ${viewPayment.payment_code}`}
          onClose={() => setViewPayment(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewPayment(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Payment ID" value={viewPayment.payment_code} />
            <DetailRow label="Supplier" value={viewPayment.supplier_name} />
            <DetailRow label="Amount" value={`Rs. ${Number(viewPayment.amount || 0).toFixed(2)}`} />
            <DetailRow label="Payment Mode" value={(viewPayment.payment_mode || 'cash').toUpperCase()} />
            <DetailRow label="Reference No" value={viewPayment.reference_no || '-'} />
            <DetailRow label="Date" value={viewPayment.paid_at || viewPayment.created_at || '-'} />
            <DetailRow label="Notes" value={viewPayment.notes || '-'} />
            <DetailRow label="Recorded By" value={viewPayment.paid_by_name || 'Staff'} />
          </View>
        </FormModal>
      )}

      {/* Edit Payment Modal */}
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

export function PurchasingScreen() {
  const canManageGrn = usePermission('purchases.create_grn');
  const canSettlePayment = usePermission('purchases.settle_supplier_payment');
  const [tab, setTab] = useState('grn');
  const [modalVisible, setModalVisible] = useState(false);

  const canCreate = tab === 'grn' ? canManageGrn : canSettlePayment;

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <SegmentedTabs
            tabs={[{ key: 'grn', label: 'GRN' }, { key: 'payments', label: 'Supplier Payments' }]}
            active={tab}
            onChange={(t) => { setTab(t); setModalVisible(false); }}
          />
        </View>
        {canCreate && (
          <TouchableOpacity style={styles.topRightBtn} onPress={() => setModalVisible(true)}>
            <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
            <Text style={styles.topRightBtnText}>
              {tab === 'grn' ? '+ New GRN' : '+ Settle Payment'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flex: 1, marginTop: 4 }}>
        {tab === 'grn'
          ? <GrnTab modalVisible={modalVisible} setModalVisible={setModalVisible} />
          : <PaymentsTab modalVisible={modalVisible} setModalVisible={setModalVisible} />}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  topRightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navbar,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
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
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 6,
  },
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
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.borderSoft },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', color: colors.ink },
  status: { fontWeight: '700', fontSize: 11, textTransform: 'uppercase', color: colors.gold },
  cardMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  cardTotal: { fontWeight: '700', color: colors.ink, marginTop: 6 },
  cardActions: { flexDirection: 'row', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.borderSoft },
  actionBtnText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  total: { textAlign: 'right', fontWeight: '700', marginTop: 8, color: colors.ink },
  paymentForm: { padding: 12, backgroundColor: colors.card, margin: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft },
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 13 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 13 },
});
