import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsApi } from '../../api/postsale';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

const PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash' }, { id: 'upi', name: 'UPI' }, { id: 'card', name: 'Card' }, { id: 'other', name: 'Other' },
];

/**
 * Two modes, mirroring the web app's own Collect modal exactly:
 * "Auto" applies one lump amount oldest-invoice-first (backend default
 * allocation); "Select Invoices" pays specific invoices — checking exactly
 * one invoice is how you "Pay" that single invoice, same as web.
 */
function CollectModal({ customer, onClose }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('fifo');
  const [amount, setAmount] = useState('');
  const [checkedIds, setCheckedIds] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [error, setError] = useState('');

  const unpaidQuery = useQuery({ queryKey: ['unpaid-invoices', customer.customer_id], queryFn: () => collectionsApi.unpaidInvoices(customer.customer_id) });
  const unpaid = unpaidQuery.data || [];

  const createMutation = useMutation({
    mutationFn: collectionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections-pending'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['unpaid-invoices', customer.customer_id] });
      onClose();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const toggleChecked = (id) => setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const checkedTotal = unpaid.filter((inv) => checkedIds.includes(inv.id)).reduce((sum, inv) => sum + Number(inv.balance_due), 0);

  const submit = () => {
    setError('');
    if (mode === 'manual') {
      if (checkedIds.length === 0) return setError('Select at least one invoice.');
      const allocations = unpaid.filter((inv) => checkedIds.includes(inv.id)).map((inv) => ({ invoice_id: inv.id, allocated_amount: Number(inv.balance_due) }));
      createMutation.mutate({ customer_id: customer.customer_id, amount: checkedTotal, payment_method: paymentMethod, allocations });
    } else {
      if (!amount) return setError('Enter an amount.');
      createMutation.mutate({ customer_id: customer.customer_id, amount: Number(amount), payment_method: paymentMethod });
    }
  };

  return (
    <FormModal
      visible title={`Collect from ${customer.ledger_name}`} onClose={onClose}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={onClose}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]} onPress={submit} disabled={createMutation.isPending}>
            <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Paying…' : 'Pay Now'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <View style={styles.breakdownBox}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Opening Balance:</Text>
          <Text style={styles.breakdownVal}>Rs. {Number(customer.opening_balance || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Unpaid Invoices ({customer.unpaid_invoice_count || 0}):</Text>
          <Text style={styles.breakdownVal}>Rs. {Number(customer.unpaid_invoice_total || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Total Collected:</Text>
          <Text style={styles.breakdownVal}>Rs. {Number(customer.total_collected || 0).toFixed(2)}</Text>
        </View>
        <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 4, marginTop: 4 }]}>
          <Text style={[styles.breakdownLabel, { fontWeight: '700', color: colors.danger }]}>Total Outstanding:</Text>
          <Text style={[styles.breakdownVal, { fontWeight: '700', color: colors.danger }]}>Rs. {customer.total_due}</Text>
        </View>
      </View>

      <View style={styles.modeToggle}>
        <TouchableOpacity style={[styles.modeBtn, mode === 'fifo' && styles.modeBtnActive]} onPress={() => setMode('fifo')}>
          <Text style={mode === 'fifo' ? styles.modeTextActive : styles.modeText}>Auto (Oldest Bill First)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === 'manual' && styles.modeBtnActive]} onPress={() => setMode('manual')}>
          <Text style={mode === 'manual' ? styles.modeTextActive : styles.modeText}>Select Invoices</Text>
        </TouchableOpacity>
      </View>

      <SelectField label="Payment Method" value={paymentMethod} options={PAYMENT_METHODS} onChange={setPaymentMethod} />

      {mode === 'fifo' ? (
        <>
          <Text style={formStyles.label}>Amount Collected</Text>
          <TextInput keyboardType="numeric" value={amount} onChangeText={setAmount} style={formStyles.input} />
          {Number(amount) > Number(customer.total_due || 0) && (
            <Text style={{ fontSize: 11, color: colors.gold, marginTop: 4, fontWeight: '600' }}>
              Note: Rs. {(Number(amount) - Number(customer.total_due || 0)).toFixed(2)} extra amount will be credited to customer's advance balance and recorded in revenue/collections.
            </Text>
          )}
        </>
      ) : (
        <>
          <Text style={formStyles.label}>Unpaid Invoices</Text>
          <View style={styles.invoiceBox}>
            {unpaid.map((inv) => (
              <TouchableOpacity key={inv.id} style={styles.invoiceRow} onPress={() => toggleChecked(inv.id)}>
                <View style={[styles.checkbox, checkedIds.includes(inv.id) && styles.checkboxChecked]}>
                  {checkedIds.includes(inv.id) && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
                <Text style={styles.invoiceLabel}>{inv.invoice_no}</Text>
                <Text style={styles.invoiceAmount}>Rs. {inv.balance_due}</Text>
              </TouchableOpacity>
            ))}
            {unpaid.length === 0 && <Text style={styles.emptySmall}>No unpaid invoices.</Text>}
          </View>
          <View style={styles.selectedTotalBox}>
            <Text style={styles.selectedTotalLabel}>Selected Invoice Total</Text>
            <Text style={styles.selectedTotalValue}>Rs. {checkedTotal.toFixed(2)}</Text>
          </View>
        </>
      )}
      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

export function CollectionsScreen() {
  const canViewAll = usePermission('credit.view_shopwide_outstanding');
  const canCollect = usePermission('collections.field_collection_entry');
  const [selected, setSelected] = useState(null);
  const pendingQuery = useQuery({ queryKey: ['collections-pending'], queryFn: () => collectionsApi.pending(), enabled: canViewAll });
  const historyQuery = useQuery({ queryKey: ['collections'], queryFn: collectionsApi.list });

  const pending = pendingQuery.data || [];
  const history = historyQuery.data || [];
  const historyTotal = history.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <View style={styles.screen}>
      <FlatList
        data={[{ type: 'header' }, ...(canViewAll ? pending.map((p) => ({ type: 'pending', ...p })) : []), { type: 'historyHeader', total: historyTotal }, ...history.map((h) => ({ type: 'history', ...h }))]}
        keyExtractor={(r, idx) => `${r.type}-${r.customer_id || r.id || idx}`}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          if (item.type === 'header') return canViewAll ? <Text style={styles.sectionTitle}>Pending Credit Balances</Text> : null;
          if (item.type === 'historyHeader') return <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Collection History · Total Rs. {item.total.toFixed(2)}</Text>;
          if (item.type === 'pending') {
            return (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.ledger_name}</Text>
                  <Text style={styles.cardMeta}>{item.phone || 'No phone'} · {item.unpaid_invoice_count} unpaid bill(s)</Text>
                  {Number(item.opening_balance || 0) > 0.009 && (
                    <Text style={[styles.cardMeta, { color: colors.gold, fontWeight: '700' }]}>
                      Opening Bal: Rs. {Number(item.opening_balance).toFixed(2)}
                    </Text>
                  )}
                  <Text style={styles.cardTotalDanger}>Total Due: Rs. {item.total_due}</Text>
                </View>
                {canCollect && (
                  <TouchableOpacity style={styles.collectBtn} onPress={() => setSelected(item)}>
                    <Icon name="collections" size={14} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.collectBtnText}>Collect</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }
          return (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.receipt_no}</Text>
                <Text style={styles.cardMeta}>{item.customer_name} · {item.payment_method}</Text>
              </View>
              <Text style={styles.cardTotal}>Rs. {item.amount}</Text>
            </View>
          );
        }}
      />
      {selected && <CollectModal customer={selected} onClose={() => setSelected(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  sectionTitle: { fontWeight: '700', color: colors.ink, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.borderSoft },
  cardTitle: { fontWeight: '700', color: colors.ink },
  cardMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  cardTotal: { fontWeight: '700', color: colors.ink },
  cardTotalDanger: { fontWeight: '700', color: colors.danger, marginTop: 4 },
  collectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.navbar, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  collectBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  meta: { color: colors.inkMuted, fontSize: 12, marginBottom: 10 },
  modeToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderSoft, marginBottom: 12 },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.page },
  modeBtnActive: { backgroundColor: colors.gold },
  modeText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  modeTextActive: { fontSize: 12, color: '#fff', fontWeight: '700' },
  invoiceBox: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, marginTop: 6 },
  invoiceRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '700' },
  invoiceLabel: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '600' },
  invoiceAmount: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  emptySmall: { padding: 12, color: colors.inkMuted, fontSize: 12, textAlign: 'center' },
  breakdownBox: { backgroundColor: colors.page, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, padding: 10, marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  breakdownLabel: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  breakdownVal: { fontSize: 12, color: colors.ink, fontWeight: '700' },
  selectedTotalBox: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  selectedTotalLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  selectedTotalValue: { color: colors.ink, fontSize: 14, fontWeight: '700' },
});
