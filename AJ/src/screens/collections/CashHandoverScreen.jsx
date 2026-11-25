import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cashHandoversApi } from '../../api/postsale';
import { friendlyErrorMessage } from '../../api/client';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';
import { formStyles } from '../../components/FormModal';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';

export function CashHandoverScreen() {
  const canSubmit = usePermission('handover.submit_cash_handover');
  const canVerify = usePermission('handover.verify_reconcile');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending'); // 'pending' | 'register'
  const [submittedAmounts, setSubmittedAmounts] = useState({});
  const [verifyAmounts, setVerifyAmounts] = useState({});
  const [error, setError] = useState('');

  const pendingQuery = useQuery({ queryKey: ['handover-pending'], queryFn: cashHandoversApi.pending });
  const registerQuery = useQuery({ queryKey: ['handovers'], queryFn: cashHandoversApi.list });

  const submitMutation = useMutation({
    mutationFn: cashHandoversApi.submit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handover-pending'] });
      queryClient.invalidateQueries({ queryKey: ['handovers'] });
      pendingQuery.refetch();
      registerQuery.refetch();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, amount }) => cashHandoversApi.verify(id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['handovers'] });
      registerQuery.refetch();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const pending = pendingQuery.data || [];
  const register = registerQuery.data || [];

  return (
    <View style={styles.screen}>
      {/* Handover Header */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>Handover</Text>
          <Text style={styles.headerSubtitle}>Salesman daily cash transfers & reconciliation</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <SegmentedTabs
          tabs={[
            { key: 'pending', label: `Pending (${pending.length})` },
            { key: 'register', label: `Audit Register (${register.length})` },
          ]}
          active={tab}
          onChange={setTab}
        />
      </View>

      {error ? <Text style={[formStyles.error, { marginHorizontal: 12, marginTop: 8 }]}>{error}</Text> : null}

      {tab === 'pending' ? (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
          refreshing={pendingQuery.isFetching}
          onRefresh={pendingQuery.refetch}
          ListHeaderComponent={
            <View style={styles.statusBanner}>
              <View style={styles.statusBannerRow}>
                <Icon name="collections" size={16} color={colors.primary || '#2449C6'} style={{ marginRight: 6 }} />
                <Text style={styles.statusBannerTitle}>Pending Salesman Collections Ready for Handover</Text>
              </View>
              <Text style={styles.statusBannerCount}>{pending.length} pending salesman handover(s)</Text>
            </View>
          }
          data={pending}
          keyExtractor={(p) => String(p.employee_id)}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.empty}>Nothing pending handover.</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.salesmanName}>{p.employee_name}</Text>
                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeText}>Total: Rs. {Number(p.total_amount || 0).toFixed(2)}</Text>
                </View>
              </View>

              {/* All 6 fields cleanly arranged without horizontal scrolling */}
              <View style={styles.metricGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Cash Collected</Text>
                  <Text style={[styles.metricValue, { color: colors.success }]}>
                    Rs. {Number(p.cash_amount || 0).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Digital / UPI</Text>
                  <Text style={[styles.metricValue, { color: colors.primary || '#2449C6' }]}>
                    Rs. {Number(p.digital_amount || 0).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.handoverInputBox}>
                <Text style={styles.inputFieldLabel}>Cash Being Handed Over (Rs.)</Text>
                <View style={styles.row}>
                  <TextInput
                    keyboardType="numeric"
                    placeholder={String(p.cash_amount)}
                    placeholderTextColor={colors.inkMuted}
                    value={submittedAmounts[p.employee_id] ?? ''}
                    onChangeText={(v) => setSubmittedAmounts((prev) => ({ ...prev, [p.employee_id]: v }))}
                    style={[formStyles.input, styles.amountInput]}
                  />
                  {canSubmit && (
                    <TouchableOpacity
                      style={[styles.actionBtn, submitMutation.isPending && formStyles.disabled]}
                      disabled={submitMutation.isPending}
                      onPress={() => {
                        setError('');
                        submitMutation.mutate({
                          employee_id: p.employee_id,
                          submitted_amount: Number(submittedAmounts[p.employee_id] ?? p.cash_amount),
                        });
                      }}
                    >
                      <Text style={styles.actionBtnText}>
                        {submitMutation.isPending ? 'Saving…' : 'Handover Cash'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
          refreshing={registerQuery.isFetching}
          onRefresh={registerQuery.refetch}
          ListHeaderComponent={
            <View style={styles.statusBanner}>
              <View style={styles.statusBannerRow}>
                <Icon name="reports" size={16} color={colors.gold} style={{ marginRight: 6 }} />
                <Text style={styles.statusBannerTitle}>Reconciliation Audit Register</Text>
              </View>
              <Text style={styles.statusBannerCount}>{register.length} record(s)</Text>
            </View>
          }
          data={register}
          keyExtractor={(h) => String(h.id)}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.empty}>No reconciliation records found.</Text>
            </View>
          }
          renderItem={({ item: h }) => {
            const hasDiscrepancy = h.discrepancy != null && Math.abs(h.discrepancy) > 0.009;
            const isVerified = h.status === 'verified' || h.status === 'approved';
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.salesmanName}>{h.handover_no} · {h.employee_name}</Text>
                  <View style={[styles.badge, { backgroundColor: isVerified ? '#ECFDF5' : '#FFFBEB' }]}>
                    <Text style={[styles.statusText, { color: isVerified ? colors.success : colors.gold }]}>
                      {String(h.status || 'pending').replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <View style={styles.metricGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Submitted</Text>
                    <Text style={styles.metricValue}>Rs. {Number(h.submitted_amount || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Verified</Text>
                    <Text style={styles.metricValue}>
                      {h.verified_amount != null ? `Rs. ${Number(h.verified_amount).toFixed(2)}` : 'Pending'}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Discrepancy</Text>
                    <Text style={[styles.metricValue, hasDiscrepancy ? styles.discrepancyBad : styles.discrepancyOk]}>
                      {h.discrepancy != null ? `Rs. ${Number(h.discrepancy).toFixed(2)}` : '0.00'}
                    </Text>
                  </View>
                </View>

                {h.status === 'pending' && canVerify && (
                  <View style={styles.handoverInputBox}>
                    <Text style={styles.inputFieldLabel}>Reconciliation Counted Amount (Rs.)</Text>
                    <View style={styles.row}>
                      <TextInput
                        keyboardType="numeric"
                        placeholder="Counted amount"
                        placeholderTextColor={colors.inkMuted}
                        value={verifyAmounts[h.id] ?? ''}
                        onChangeText={(v) => setVerifyAmounts((prev) => ({ ...prev, [h.id]: v }))}
                        style={[formStyles.input, styles.amountInput]}
                      />
                      <TouchableOpacity
                        style={[styles.actionBtnDark, verifyMutation.isPending && formStyles.disabled]}
                        disabled={verifyMutation.isPending}
                        onPress={() => {
                          setError('');
                          verifyMutation.mutate({
                            id: h.id,
                            amount: Number(verifyAmounts[h.id] ?? h.submitted_amount),
                          });
                        }}
                      >
                        <Text style={styles.actionBtnText}>
                          {verifyMutation.isPending ? 'Saving…' : 'Verify'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  headerBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  headerSubtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  statusBanner: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    marginBottom: 10,
  },
  statusBannerRow: { flexDirection: 'row', alignItems: 'center' },
  statusBannerTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  statusBannerCount: { fontSize: 12, fontWeight: '600', color: colors.gold, marginTop: 4 },
  emptyBox: { alignItems: 'center', marginTop: 40 },
  empty: { textAlign: 'center', color: colors.inkMuted, fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  salesmanName: { fontWeight: '800', color: colors.ink, fontSize: 15 },
  totalBadge: { backgroundColor: '#EDF5FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#D5E3F7' },
  totalBadgeText: { color: colors.primary || '#2449C6', fontWeight: '800', fontSize: 12 },
  metricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.page,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  metricItem: { flex: 1 },
  metricLabel: { fontSize: 11, color: colors.inkMuted, fontWeight: '600', marginBottom: 2 },
  metricValue: { fontSize: 13, fontWeight: '700', color: colors.ink },
  handoverInputBox: { marginTop: 4 },
  inputFieldLabel: { fontSize: 11, fontWeight: '700', color: colors.inkMuted, marginBottom: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, textTransform: 'uppercase', fontWeight: '700' },
  discrepancyOk: { color: colors.success, fontWeight: '700' },
  discrepancyBad: { color: colors.danger, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput: { flex: 1, marginBottom: 0, height: 42 },
  actionBtn: { backgroundColor: colors.navbar, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 8 },
  actionBtnDark: { backgroundColor: colors.navbar, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 8 },
  actionBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
});
