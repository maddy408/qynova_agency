import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet, ScrollView } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi, expenseCategoriesApi, otherIncomeApi, collectionsApi } from '../../api/postsale';
import { customersApi } from '../../api/parties';
import { friendlyErrorMessage } from '../../api/client';
import { SelectField } from '../../components/SelectField';
import { FormModal, formStyles } from '../../components/FormModal';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { downloadReportPdf } from '../../utils/pdfService';
import { colors } from '../../theme/colors';

export function ExpensesScreen() {
  const canManage = usePermission('expenses.manage');
  const [tab, setTab] = useState('expenses'); // 'expenses' | 'income' | 'receipts'

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <SegmentedTabs
          tabs={[
            { key: 'expenses', label: 'Operating Expenses' },
            { key: 'income', label: 'Extra Income' },
            { key: 'receipts', label: 'Receipts' },
          ]}
          active={tab}
          onChange={setTab}
          style={{ marginHorizontal: 12, marginTop: 8, marginBottom: 8 }}
        />
      </View>

      <View style={{ flex: 1, marginTop: 4 }}>
        {tab === 'expenses' && <OperatingExpensesPanel canManage={canManage} />}
        {tab === 'income' && <OtherIncomePanel canManage={canManage} />}
        {tab === 'receipts' && <ReceiptsPanel canManage={canManage} />}
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
  const [touched, setTouched] = useState({});
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
    setTouched({});
    setModalVisible(true);
  };

  const openEdit = (expense) => {
    setEditingExpense(expense);
    setCategoryId(expense.category_id ? Number(expense.category_id) : null);
    setAmount(String(expense.amount || ''));
    setPaymentMode(expense.payment_mode || 'cash');
    setDescription(expense.description || '');
    setError('');
    setTouched({});
    setModalVisible(true);
  };

  const closeForm = () => {
    setModalVisible(false);
    setEditingExpense(null);
    setError('');
    setTouched({});
  };

  const submit = () => {
    setTouched({ category: true, amount: true });
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
            placeholder="Search category, note, amount..."
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
            <Text style={styles.topRightBtnText}>Add</Text>
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
        {touched.category && !categoryId ? (
          <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Category is required.</Text>
        ) : null}

        <Text style={formStyles.label}>Amount (Rs.) *</Text>
        <TextInput
          keyboardType="numeric"
          value={amount}
          onBlur={() => setTouched((p) => ({ ...p, amount: true }))}
          onChangeText={(v) => { setError(''); setAmount(v); }}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="0.00"
          placeholderTextColor={colors.inkMuted}
        />
        {touched.amount && (!amount || Number(amount) <= 0) ? (
          <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Valid amount &gt; 0 is required.</Text>
        ) : null}

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
          placeholder="Vendor name, bill # or purpose..."
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
// 2. Extra Income Panel
// -----------------------------------------------------------------------------
function OtherIncomePanel({ canManage }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => otherIncomeApi.update(id, data),
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
    setEditingIncome(null);
    setAmount('');
    setPaymentMode('cash');
    setDescription('');
    setError('');
    setTouched({});
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingIncome(item);
    setAmount(String(item.amount || ''));
    setPaymentMode(item.payment_mode || 'cash');
    setDescription(item.description || '');
    setError('');
    setTouched({});
    setModalVisible(true);
  };

  const closeForm = () => {
    setModalVisible(false);
    setEditingIncome(null);
    setError('');
    setTouched({});
  };

  const submit = () => {
    setTouched({ amount: true, description: true });
    setError('');
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return setError('Please enter a valid amount greater than 0.');
    }
    if (!description.trim()) {
      return setError('Description / note is required.');
    }

    const payload = {
      amount: numAmount,
      payment_mode: paymentMode,
      description: description.trim(),
    };

    if (editingIncome) {
      updateMutation.mutate({ id: editingIncome.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const confirmDelete = (item) => {
    Alert.alert(
      'Delete Income Record?',
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

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={{ flex: 1 }}>
      {/* Top Action Row */}
      <View style={styles.topActionRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search extra income by #, description, mode..."
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
            <Text style={styles.topRightBtnText}>Add Income</Text>
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
            <Text style={styles.empty}>No extra income recorded yet.</Text>
          ) : (
            <View style={styles.noResultsBox}>
              <Text style={styles.empty}>No extra income found matching "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewIncome(r)}>
              <Text style={styles.cardTitle}>{r.receipt_no || `INC #${r.id}`}</Text>
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

      {/* Add / Edit Extra Income Modal */}
      <FormModal
        visible={modalVisible}
        title={editingIncome ? 'Edit Extra Income' : 'Add Extra Income'}
        onClose={closeForm}
        footer={
          <>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={closeForm}>
              <Text style={formStyles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[formStyles.primaryBtn, saving && formStyles.disabled]} onPress={submit} disabled={saving}>
              <Text style={formStyles.primaryBtnText}>{saving ? 'Saving…' : (editingIncome ? 'Update Income' : 'Save Income')}</Text>
            </TouchableOpacity>
          </>
        }
      >
        <Text style={formStyles.label}>Amount (Rs.) *</Text>
        <TextInput
          keyboardType="numeric"
          value={amount}
          onBlur={() => setTouched((p) => ({ ...p, amount: true }))}
          onChangeText={(v) => { setError(''); setAmount(v); }}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="0.00"
          placeholderTextColor={colors.inkMuted}
        />
        {touched.amount && (!amount || Number(amount) <= 0) ? (
          <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Valid amount &gt; 0 is required.</Text>
        ) : null}

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
          onBlur={() => setTouched((p) => ({ ...p, description: true }))}
          onChangeText={(v) => { setError(''); setDescription(v); }}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="e.g. Scrap sales, interest, commission..."
          placeholderTextColor={colors.inkMuted}
        />
        {touched.description && !description.trim() ? (
          <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Description is required.</Text>
        ) : null}
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </FormModal>

      {/* View Detail Modal */}
      {viewIncome && (
        <FormModal
          visible
          title="Income Details"
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

// -----------------------------------------------------------------------------
// 3. Receipts Panel (Past Collection Receipts)
// -----------------------------------------------------------------------------
function ReceiptsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});

  const receiptsQuery = useQuery({ queryKey: ['collections-receipts'], queryFn: collectionsApi.list });
  const customersQuery = useQuery({ queryKey: ['customers-list-all'], queryFn: () => customersApi.list() });

  const customers = useMemo(() => {
    const raw = customersQuery.data;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }, [customersQuery.data]);

  const rows = useMemo(() => receiptsQuery.data || [], [receiptsQuery.data]);

  const totalCollected = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const recNo = (r.receipt_no || '').toLowerCase();
      const cust = (r.customer_name || '').toLowerCase();
      const collectedBy = (r.collected_by_name || '').toLowerCase();
      const mode = (r.payment_method || '').toLowerCase();
      const num = String(r.amount || '');
      const date = (r.collected_at || '').toLowerCase();
      return recNo.includes(q) || cust.includes(q) || collectedBy.includes(q) || mode.includes(q) || num.includes(q) || date.includes(q);
    });
  }, [rows, search]);

  const createMutation = useMutation({
    mutationFn: collectionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections-receipts'] });
      receiptsQuery.refetch();
      closeForm();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const openAdd = () => {
    setCustomerId(null);
    setAmount('');
    setPaymentMethod('cash');
    setReferenceNo('');
    setNotes('');
    setError('');
    setTouched({});
    setModalVisible(true);
  };

  const closeForm = () => {
    setModalVisible(false);
    setError('');
    setTouched({});
  };

  const submit = () => {
    setTouched({ customer: true, amount: true });
    setError('');
    if (!customerId) return setError('Please select a customer.');
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return setError('Please enter a valid amount greater than 0.');
    }

    createMutation.mutate({
      customer_id: customerId,
      amount: numAmount,
      payment_method: paymentMethod,
      reference_no: referenceNo ? referenceNo.trim() : null,
      notes: notes ? notes.trim() : null,
    });
  };

  const handlePrintReceipt = (receipt) => {
    downloadReportPdf({
      title: `Collection Receipt ${receipt.receipt_no || '#' + receipt.id}`,
      columns: [
        { header: 'Field', key: 'field' },
        { header: 'Detail', key: 'detail' },
      ],
      data: [
        { field: 'Receipt Number', detail: receipt.receipt_no || `#${receipt.id}` },
        { field: 'Customer', detail: receipt.customer_name || 'N/A' },
        { field: 'Amount Collected', detail: `Rs. ${Number(receipt.amount || 0).toFixed(2)}` },
        { field: 'Payment Method', detail: (receipt.payment_method || 'cash').toUpperCase() },
        { field: 'Collected By', detail: receipt.collected_by_name || 'Staff' },
        { field: 'Date & Time', detail: receipt.collected_at || '-' },
        { field: 'Reference #', detail: receipt.reference_no || '-' },
        { field: 'Notes', detail: receipt.notes || '-' },
      ],
    });
  };

  const saving = createMutation.isPending;

  return (
    <View style={{ flex: 1 }}>
      {/* Top Banner Total Collected */}
      <View style={styles.receiptSummaryBanner}>
        <View>
          <Text style={styles.receiptSummaryLabel}>Total Collected Receipts</Text>
          <Text style={styles.receiptSummaryVal}>Rs. {totalCollected.toFixed(2)}</Text>
        </View>
        <Text style={styles.receiptSummaryCount}>{rows.length} record(s)</Text>
      </View>

      {/* Top Action Row */}
      <View style={styles.topActionRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search receipts by #, customer, staff..."
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
            <Text style={styles.topRightBtnText}>+ Collect</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={receiptsQuery.isFetching}
        onRefresh={receiptsQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No collection receipts found.</Text>
          ) : (
            <View style={styles.noResultsBox}>
              <Text style={styles.empty}>No receipts found matching "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewReceipt(r)}>
              <Text style={styles.cardTitle}>{r.receipt_no || `REC #${r.id}`}</Text>
              <Text style={styles.cardSubtitle}>{r.customer_name || 'Customer'}</Text>
              <Text style={styles.cardMeta}>
                {r.collected_at || 'Date N/A'} · By: {r.collected_by_name || 'Staff'}
              </Text>
              <View style={[styles.paymentModePill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Text style={[styles.paymentModeText, { color: colors.primary }]}>
                  {(r.payment_method || 'cash').toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.cardTotal, { color: colors.primary }]}>
                Rs. {Number(r.amount || 0).toFixed(2)}
              </Text>
              <View style={styles.actionBtns}>
                <TouchableOpacity onPress={() => setViewReceipt(r)} style={styles.actionBtn} title="View Details">
                  <Icon name="view" size={15} color={colors.inkMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handlePrintReceipt(r)} style={styles.actionBtn} title="Print Receipt">
                  <Icon name="printer" size={15} color={colors.gold} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      {/* Add Collection Receipt Modal */}
      <FormModal
        visible={modalVisible}
        title="Record Collection Receipt"
        onClose={closeForm}
        footer={
          <>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={closeForm}>
              <Text style={formStyles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[formStyles.primaryBtn, saving && formStyles.disabled]} onPress={submit} disabled={saving}>
              <Text style={formStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Receipt'}</Text>
            </TouchableOpacity>
          </>
        }
      >
        <SelectField
          label="Customer *"
          value={customerId}
          options={customers.map((c) => ({ id: c.id, name: `${c.ledger_name || c.name || 'Customer'} (${c.phone || c.code || ''})` }))}
          onChange={(v) => { setError(''); setCustomerId(v); }}
        />
        {touched.customer && !customerId ? (
          <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Customer selection is required.</Text>
        ) : null}

        <Text style={formStyles.label}>Amount Collected (Rs.) *</Text>
        <TextInput
          keyboardType="numeric"
          value={amount}
          onBlur={() => setTouched((p) => ({ ...p, amount: true }))}
          onChangeText={(v) => { setError(''); setAmount(v); }}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="0.00"
          placeholderTextColor={colors.inkMuted}
        />
        {touched.amount && (!amount || Number(amount) <= 0) ? (
          <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Valid amount &gt; 0 is required.</Text>
        ) : null}

        <SelectField
          label="Payment Method"
          value={paymentMethod}
          options={[
            { id: 'cash', name: 'Cash' },
            { id: 'upi', name: 'UPI' },
            { id: 'bank_transfer', name: 'Bank Transfer' },
            { id: 'cheque', name: 'Cheque' },
          ]}
          onChange={setPaymentMethod}
        />

        <Text style={formStyles.label}>Reference # (Optional)</Text>
        <TextInput
          value={referenceNo}
          onChangeText={setReferenceNo}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="Cheque # / UTR / Transaction ID"
          placeholderTextColor={colors.inkMuted}
        />

        <Text style={formStyles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[formStyles.input, { color: colors.ink }]}
          placeholder="Optional collection notes"
          placeholderTextColor={colors.inkMuted}
        />
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </FormModal>

      {/* View Detail Modal */}
      {viewReceipt && (
        <FormModal
          visible
          title="Collection Receipt"
          onClose={() => setViewReceipt(null)}
          footer={
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[formStyles.secondaryBtn, { flex: 1 }]}
                onPress={() => handlePrintReceipt(viewReceipt)}
              >
                <Text style={formStyles.secondaryBtnText}>Print / PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[formStyles.primaryBtn, { flex: 1 }]}
                onPress={() => setViewReceipt(null)}
              >
                <Text style={formStyles.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Receipt #" value={viewReceipt.receipt_no || `REC-${viewReceipt.id}`} />
            <DetailRow label="Customer" value={viewReceipt.customer_name || 'N/A'} />
            <DetailRow label="Amount" value={`Rs. ${Number(viewReceipt.amount || 0).toFixed(2)}`} />
            <DetailRow label="Payment Mode" value={(viewReceipt.payment_method || 'cash').toUpperCase()} />
            <DetailRow label="Collected At" value={viewReceipt.collected_at || '-'} />
            <DetailRow label="Collected By" value={viewReceipt.collected_by_name || 'Staff'} />
            <DetailRow label="Reference #" value={viewReceipt.reference_no || '-'} />
            <DetailRow label="Notes" value={viewReceipt.notes || '-'} />
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
    paddingVertical: 2,
  },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    height: 42,
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
  cardSubtitle: { fontWeight: '600', color: colors.inkSoft, fontSize: 13, marginTop: 2 },
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
  receiptSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  receiptSummaryLabel: { fontSize: 11, fontWeight: '600', color: '#166534', textTransform: 'uppercase' },
  receiptSummaryVal: { fontSize: 16, fontWeight: '900', color: '#15803D', marginTop: 2 },
  receiptSummaryCount: { fontSize: 12, fontWeight: '700', color: '#166534' },
});
