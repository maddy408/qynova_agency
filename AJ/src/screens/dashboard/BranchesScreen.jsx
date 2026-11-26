import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../../api/branches';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

export function BranchesScreen() {
  const canManage = usePermission('branches.manage');
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(undefined);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  const listQuery = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list });
  const createMutation = useMutation({
    mutationFn: branchesApi.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); setModal(undefined); },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => branchesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); setModal(undefined); },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const openCreate = () => { setForm({ branch_name: '', print_name: '', phone: '', address_line1: '' }); setError(''); setModal(null); };
  const openEdit = (b) => { setForm(b); setError(''); setModal(b); };
  const submit = () => {
    setError('');
    if (form.phone) {
      if (form.phone.length !== 10) {
        return setError(`Phone number must be exactly 10 digits (${form.phone.length}/10).`);
      }
      if (!/^[6-9]/.test(form.phone)) {
        return setError('Phone number must start with 6, 7, 8 or 9.');
      }
    }
    if (modal?.id) updateMutation.mutate({ id: modal.id, data: form });
    else createMutation.mutate(form);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <Text style={styles.topTitle}>Branch List</Text>
        {canManage && (
          <TouchableOpacity style={styles.topRightBtn} onPress={openCreate}>
            <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
            <Text style={styles.topRightBtnText}>+ Add Branch</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={listQuery.data || []}
        keyExtractor={(r) => String(r.id)}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => canManage && openEdit(item)}>
            <Text style={styles.name}>{item.branch_name}{item.is_main_branch ? ' (Main)' : ''}</Text>
            <Text style={styles.meta}>{item.address_line1}</Text>
            <Text style={styles.meta}>{item.status}</Text>
          </TouchableOpacity>
        )}
      />

      <FormModal
        visible={modal !== undefined}
        title={modal?.id ? 'Edit Branch' : 'New Branch'}
        onClose={() => setModal(undefined)}
        footer={
          <>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => setModal(undefined)}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={formStyles.primaryBtn} onPress={submit}><Text style={formStyles.primaryBtnText}>Save</Text></TouchableOpacity>
          </>
        }
      >
        <Text style={formStyles.label}>Branch Name</Text>
        <TextInput value={form.branch_name || ''} onChangeText={(v) => setForm((p) => ({ ...p, branch_name: v }))} style={formStyles.input} />
        <Text style={formStyles.label}>Print Name</Text>
        <TextInput value={form.print_name || ''} onChangeText={(v) => setForm((p) => ({ ...p, print_name: v }))} style={formStyles.input} />
        <Text style={formStyles.label}>Phone</Text>
        <TextInput
          value={form.phone || ''}
          onChangeText={(v) => {
            const cleaned = v.replace(/\D/g, '').slice(0, 10);
            setForm((p) => ({ ...p, phone: cleaned }));
          }}
          keyboardType="numeric"
          maxLength={10}
          placeholder="10-digit phone (e.g. 9876543210)"
          style={formStyles.input}
        />
        <Text style={formStyles.label}>Address</Text>
        <TextInput value={form.address_line1 || ''} onChangeText={(v) => setForm((p) => ({ ...p, address_line1: v }))} style={formStyles.input} />
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </FormModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  topRightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navbar,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  topRightBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  name: { fontWeight: '700', color: colors.ink },
  meta: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
});
