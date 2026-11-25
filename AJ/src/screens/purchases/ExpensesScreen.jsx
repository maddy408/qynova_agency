import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi, expenseCategoriesApi, otherIncomeApi } from '../../api/postsale';
import { friendlyErrorMessage } from '../../api/client';
import { SelectField } from '../../components/SelectField';
import { FormModal, formStyles } from '../../components/FormModal';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

export function ExpensesScreen() {
  const canManage = usePermission('expenses.manage');
  const [tab, setTab] = useState('expenses'); // 'expenses' | 'income'

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <SegmentedTabs
            tabs={[
              { key: 'expenses', label: 'Operating Expenses' },
              { key: 'income', label: 'Extra Income & Receipts' },
            ]}
            active={tab}
            onChange={setTab}
          />
        </View>
      </View>

      <View style={{ flex: 1, marginTop: 4 }}>
        {tab === 'expenses' ? (
          <OperatingExpensesPanel canManage={canManage} />
        ) : (
          <OtherIncomePanel canManage={canManage} />
        )}
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------------
// 1. Operating Expenses Panel
// -----------------------------------------------------------------------------
function OperatingExpensesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [viewExpense, setViewExpense] = useState(null);

  const categoriesQuery = useQuery({ queryKey: ['expense-categories'], queryFn: expenseCategoriesApi.list });
  const listQuery = useQuery({ queryKey: ['expenses'], queryFn: expensesApi.list });

  const categories = useMemo(() => categoriesQuery.data || [], [categoriesQuery.data]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [Number(c.id), c.name])), [categories]);

  const createMutation = useMutation({
    mutationFn: expensesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      listQuery.refetch();
      closeForm();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => expensesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      listQuery.refetch();
      closeForm();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: expensesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      listQuery.refetch();
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const openAdd = () => {
    setEditingExpense(null);
    setCategoryId(null);
    setAmount('');
    setPaymentMode('cash');
    setDescription('');
    setError('');
    setModalVisible(true);
  };

  const openEdit = (expense) => {
    setEditingExpense(expense);
    setCategoryId(expense.category_id ? Number(expense.category_id) : null);
    setAmount(String(expense.amount || ''));
    setPaymentMode(expense.payment_mode || 'cash');
    setDescription(expense.description || '');
    setError('');
    setModalVisible(true);
  };

  const closeForm = () => {
    setModalVisible(false);
    setEditingExpense(null);
    setError('');
  };

  const submit = () => {
    setError('');
    if (!categoryId) return setError('Please select an expense category.');
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return setError('Please enter a valid expense amount greater than 0.');
    }

    const payload = {
      category_id: categoryId,
      amount: numAmount,
      payment_mode: paymentMode,
      description: description ? description.trim() : null,
    };

    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const confirmDelete = (exp) => {
    Alert.alert(
      'Delete Expense?',
      `Are you sure you want to delete this expense of Rs. ${Number(exp.amount || 0).toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeMutation.mutate(exp.id),
        },
      ]
    );
  };

  const rows = useMemo(() => listQuery.data || [], [listQuery.data]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const catName = (r.category_name || categoryMap.get(Number(r.category_id)) || '').toLowerCase();
      const desc = (r.description || r.remarks || '').toLowerCase();
      const num = String(r.amount || '');
      const expNo = (r.expense_no || '').toLowerCase();
      const date = (r.expense_date || r.created_at || '').toLowerCase();
      return catName.includes(q) || desc.includes(q) || num.includes(q) || expNo.includes(q) || date.includes(q);
    });
  }, [rows, search, categoryMap]);

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar + Add Button */}
      <View style={styles.topActionRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search expenses by category, note, amount..."
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
        {canManage && (
          <TouchableOpacity style={styles.topRightBtn} onPress={openAdd}>
            <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
            <Text style={styles.topRightBtnText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No operating expenses recorded yet.</Text>
          ) : (
            <View style={styles.noResultsBox}>
              <Text style={styles.empty}>No expenses found matching "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewExpense(r)}>
              <Text style={styles.cardTitle}>
                {r.category_name || categoryMap.get(Number(r.category_id)) || 'General Expense'}
              </Text>
              <Text style={styles.cardMeta}>
                {r.expense_date || r.created_at || 'Date N/A'}
                {r.description ? ` · ${r.description}` : ''}
              </Text>
              <View style={styles.paymentModePill}>
                <Text style={styles.paymentModeText}>{(r.payment_mode || 'cash').toUpperCase()}</Text>
              </View>
            </TouchableOpacity>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardTotal}>Rs. {Number(r.amount || 0).toFixed(2)}</Text>
              <View style={styles.actionBtns}>
                <TouchableOpacity onPress={() => setViewExpense(r)} style={styles.actionBtn}>
                  <Icon name="view" size={15} color={colors.inkMuted} />
                </TouchableOpacity>
                {canManage && (
                  <>
                    <TouchableOpacity onPress={() => openEdit(r)} style={styles.actionBtn}>
                      <Icon name="edit" size={15} color={colors.gold} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDelete(r)} style={styles.actionBtn}>
                      <Icon name="delete" size={15} color={colors.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        )}
      />

      {/* Add / Edit Expense Form Modal */}
      <FormModal
        visible={modalVisible}
        title={editingExpense ? 'Edit Expense' : 'Add Operating Expense'}
        onClose={closeForm}
        footer={
          <>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={closeForm}>
              <Text style={formStyles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[formStyles.primaryBtn, saving && formStyles.disabled]} onPress={submit} disabled={saving}>
              <Text style={formStyles.primaryBtnText}>
                {saving ? 'Saving…' : (editingExpense ? 'Update Expense' : 'Save Expense')}
              </Text>
            </TouchableOpacity>
          </>
        }
      >
        <SelectField
          label="Category *"
          value={categoryId}
          options={categories.map((c) => ({ id: c.id, name: c.name }))}
          onChange={(v) => { setError(''); setCategoryId(v); }}
        />
        <Text style={formStyles.label}>Amount (Rs.) *</Text>
        <TextInput
          keyboardType="numeric"
          value={amount}
          onChangeText={(v) => { setError(''); setAmount(v); }}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="0.00"
          placeholderTextColor={colors.inkMuted}
        />
        <SelectField
          label="Payment Mode"
          value={paymentMode}
          options={[
            { id: 'cash', name: 'Cash' },
            { id: 'upi', name: 'UPI' },
            { id: 'bank_transfer', name: 'Bank Transfer' },
            { id: 'cheque', name: 'Cheque' },
          ]}
          onChange={setPaymentMode}
        />
        <Text style={formStyles.label}>Description / Remarks</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="Optional expense note"
          placeholderTextColor={colors.inkMuted}
        />
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </FormModal>

      {/* View Detail Modal */}
      {viewExpense && (
        <FormModal
          visible
          title="Expense Details"
          onClose={() => setViewExpense(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewExpense(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow
              label="Category"
              value={viewExpense.category_name || categoryMap.get(Number(viewExpense.category_id)) || 'General Expense'}
            />
            <DetailRow label="Expense #" value={viewExpense.expense_no || `EXP-${viewExpense.id}`} />
            <DetailRow label="Amount" value={`Rs. ${Number(viewExpense.amount || 0).toFixed(2)}`} />
            <DetailRow label="Payment Mode" value={(viewExpense.payment_mode || 'cash').toUpperCase()} />
            <DetailRow label="Date" value={viewExpense.expense_date || viewExpense.created_at || '-'} />
            <DetailRow label="Description" value={viewExpense.description || viewExpense.remarks || '-'} />
            <DetailRow label="Recorded By" value={viewExpense.created_by_name || 'Staff'} />
          </View>
        </FormModal>
      )}
    </View>
  );
}

// -----------------------------------------------------------------------------
// 2. Extra Income & Receipts Panel
// -----------------------------------------------------------------------------
function OtherIncomePanel({ canManage }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [viewIncome, setViewIncome] = useState(null);

  const listQuery = useQuery({ queryKey: ['other-income'], queryFn: otherIncomeApi.list });

  const createMutation = useMutation({
    mutationFn: otherIncomeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['other-income'] });
      listQuery.refetch();
      closeForm();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: otherIncomeApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['other-income'] });
      listQuery.refetch();
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const openAdd = () => {
    setAmount('');
    setPaymentMode('cash');
    setDescription('');
    setError('');
    setModalVisible(true);
  };

  const closeForm = () => {
    setModalVisible(false);
    setError('');
  };

  const submit = () => {
    setError('');
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return setError('Please enter a valid amount greater than 0.');
    }
    if (!description.trim()) {
      return setError('Description / note is required.');
    }

    createMutation.mutate({
      amount: numAmount,
      payment_mode: paymentMode,
      description: description.trim(),
    });
  };

  const confirmDelete = (item) => {
    Alert.alert(
      'Delete Income Receipt?',
      `Are you sure you want to delete receipt ${item.receipt_no || '#' + item.id} (Rs. ${Number(item.amount || 0).toFixed(2)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeMutation.mutate(item.id),
        },
      ]
    );
  };

  const rows = useMemo(() => listQuery.data || [], [listQuery.data]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const receiptNo = (r.receipt_no || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const num = String(r.amount || '');
      const mode = (r.payment_mode || '').toLowerCase();
      const date = (r.income_date || r.created_at || '').toLowerCase();
      return receiptNo.includes(q) || desc.includes(q) || num.includes(q) || mode.includes(q) || date.includes(q);
    });
  }, [rows, search]);

  const saving = createMutation.isPending;

  return (
    <View style={{ flex: 1 }}>
      {/* Top Action Row */}
      <View style={styles.topActionRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search receipts by #, description, mode..."
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
        {canManage && (
          <TouchableOpacity style={styles.topRightBtn} onPress={openAdd}>
            <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
            <Text style={styles.topRightBtnText}>+ Add Income</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No extra income receipts recorded yet.</Text>
          ) : (
            <View style={styles.noResultsBox}>
              <Text style={styles.empty}>No income receipts found matching "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewIncome(r)}>
              <Text style={styles.cardTitle}>{r.receipt_no || `Receipt #${r.id}`}</Text>
              <Text style={styles.cardMeta}>
                {r.income_date || r.created_at || 'Date N/A'}
                {r.description ? ` · ${r.description}` : ''}
              </Text>
              <View style={[styles.paymentModePill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Text style={[styles.paymentModeText, { color: colors.success }]}>
                  {(r.payment_mode || 'cash').toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.cardTotal, { color: colors.success }]}>
                Rs. {Number(r.amount || 0).toFixed(2)}
              </Text>
              <View style={styles.actionBtns}>
                <TouchableOpacity onPress={() => setViewIncome(r)} style={styles.actionBtn}>
                  <Icon name="view" size={15} color={colors.inkMuted} />
                </TouchableOpacity>
                {canManage && (
                  <TouchableOpacity onPress={() => confirmDelete(r)} style={styles.actionBtn}>
                    <Icon name="delete" size={15} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      />

      {/* Add Extra Income Modal */}
      <FormModal
        visible={modalVisible}
        title="Add Extra Income / Receipt"
        onClose={closeForm}
        footer={
          <>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={closeForm}>
              <Text style={formStyles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[formStyles.primaryBtn, saving && formStyles.disabled]} onPress={submit} disabled={saving}>
              <Text style={formStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Income'}</Text>
            </TouchableOpacity>
          </>
        }
      >
        <Text style={formStyles.label}>Amount (Rs.) *</Text>
        <TextInput
          keyboardType="numeric"
          value={amount}
          onChangeText={(v) => { setError(''); setAmount(v); }}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="0.00"
          placeholderTextColor={colors.inkMuted}
        />
        <SelectField
          label="Payment Mode"
          value={paymentMode}
          options={[
            { id: 'cash', name: 'Cash' },
            { id: 'upi', name: 'UPI' },
            { id: 'bank_transfer', name: 'Bank Transfer' },
            { id: 'cheque', name: 'Cheque' },
          ]}
          onChange={setPaymentMode}
        />
        <Text style={formStyles.label}>Description / Purpose *</Text>
        <TextInput
          value={description}
          onChangeText={(v) => { setError(''); setDescription(v); }}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="e.g. Scrap sales, interest, delivery charge..."
          placeholderTextColor={colors.inkMuted}
        />
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </FormModal>

      {/* View Detail Modal */}
      {viewIncome && (
        <FormModal
          visible
          title="Income Receipt Details"
          onClose={() => setViewIncome(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewIncome(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Receipt #" value={viewIncome.receipt_no || `INC-${viewIncome.id}`} />
            <DetailRow label="Amount" value={`Rs. ${Number(viewIncome.amount || 0).toFixed(2)}`} />
            <DetailRow label="Payment Mode" value={(viewIncome.payment_mode || 'cash').toUpperCase()} />
            <DetailRow label="Date" value={viewIncome.income_date || viewIncome.created_at || '-'} />
            <DetailRow label="Description" value={viewIncome.description || '-'} />
            <DetailRow label="Recorded By" value={viewIncome.created_by_name || 'Staff'} />
          </View>
        </FormModal>
      )}
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
    paddingHorizontal: 8,
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 6,
  },
  clearSearchBtn: { padding: 4 },
  clearSearchText: { color: colors.inkMuted, fontSize: 13, fontWeight: '700' },
  topRightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navbar,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  topRightBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40, fontSize: 13 },
  noResultsBox: { alignItems: 'center', marginTop: 30 },
  resetSearchBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.navbar,
  },
  resetSearchBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardTitle: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  cardMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  paymentModePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFD',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  paymentModeText: { fontSize: 10, fontWeight: '700', color: colors.inkMuted },
  cardTotal: { fontWeight: '800', color: colors.ink, fontSize: 14, marginBottom: 8 },
  actionBtns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionBtn: { padding: 4 },
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 13 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 13 },
});
