import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi, rolesApi } from '../../api/admin';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

const DEFAULT_ROLES = [
  { id: 1, name: 'Admin / Manager' },
  { id: 2, name: 'Biller / Cashier' },
  { id: 3, name: 'Salesman' },
  { id: 4, name: 'Staff' },
];

export function StaffScreen() {
  const canManage = usePermission('staff.manage_permissions');
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(undefined); // undefined closed, null create, obj edit
  const [viewStaff, setViewStaff] = useState(null);
  const [error, setError] = useState('');

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const roles = (rolesQuery.data && rolesQuery.data.length > 0) ? rolesQuery.data : DEFAULT_ROLES;

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role_id: '',
    password: '',
  });

  const listQuery = useQuery({ queryKey: ['users'], queryFn: staffApi.list });

  const createMutation = useMutation({
    mutationFn: staffApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModal(undefined);
      resetForm();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => staffApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModal(undefined);
      resetForm();
    },
    onError: (e) => setError(friendlyErrorMessage(e)),
  });

  const resetForm = () => {
    setForm({ name: '', email: '', phone: '', role_id: '', password: '' });
    setError('');
  };

  const openCreate = () => {
    resetForm();
    const defaultRole = roles.find((r) => r.name?.toLowerCase().includes('biller') || String(r.id) === '2') || roles[0];
    if (defaultRole) {
      setForm((p) => ({ ...p, role_id: String(defaultRole.id) }));
    }
    setModal(null);
  };

  const openEdit = (user) => {
    const matchedRole = roles.find((r) => String(r.id) === String(user.role_id) || r.name === user.role_name);
    const resolvedRoleId = matchedRole ? String(matchedRole.id) : (user.role_id ? String(user.role_id) : '');
    const cleanPhone = (user.phone || '').replace(/\D/g, '').slice(0, 10);
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: cleanPhone,
      role_id: resolvedRoleId,
      password: '',
    });
    setError('');
    setModal(user);
  };

  const submit = () => {
    setError('');
    const trimmedName = (form.name || '').trim();
    if (!trimmedName) {
      return setError('Full name is required.');
    }
    if (trimmedName.length < 2) {
      return setError('Full name must be at least 2 characters.');
    }

    const trimmedEmail = (form.email || '').trim().toLowerCase();
    if (!trimmedEmail) {
      return setError('Email address is required.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return setError('Please enter a valid email address (e.g. staff@example.com).');
    }

    if (form.phone) {
      if (form.phone.length !== 10) {
        return setError(`Phone number must be exactly 10 digits (${form.phone.length}/10).`);
      }
      if (!/^[6-9]/.test(form.phone)) {
        return setError('Phone number must start with 6, 7, 8 or 9.');
      }
    }

    if (!form.role_id) {
      return setError('Please select a role.');
    }

    if (!modal && (!form.password || form.password.length < 6)) {
      return setError('Password is required (minimum 6 characters).');
    }
    if (modal && form.password && form.password.length < 6) {
      return setError('New password must be at least 6 characters.');
    }

    const payload = {
      name: trimmedName,
      email: trimmedEmail,
      phone: form.phone || null,
      role_id: Number(form.role_id),
      password: form.password ? form.password : undefined,
    };

    if (modal?.id) {
      updateMutation.mutate({ id: modal.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={styles.screen}>
      {/* Top Header Controls: Title + Top Right "+ Add Staff" Button */}
      <View style={styles.topHeader}>
        <Text style={styles.topTitle}>Staff Members</Text>
        <TouchableOpacity style={styles.topRightBtn} onPress={openCreate}>
          <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
          <Text style={styles.topRightBtnText}>+ Add Staff</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listQuery.data || []}
        keyExtractor={(r) => String(r.id)}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        ListEmptyComponent={<Text style={styles.empty}>No staff members added yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewStaff(item)}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.role_name || item.role} · {item.status || 'Active'}</Text>
              <Text style={styles.meta}>{item.email} {item.phone ? `· ${item.phone}` : ''}</Text>
            </TouchableOpacity>

            <View style={styles.actionsBox}>
              <TouchableOpacity onPress={() => setViewStaff(item)} style={styles.actionBtn}>
                <Icon name="view" size={16} color={colors.inkMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
                <Icon name="edit" size={16} color={colors.gold} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Staff Form Modal (Create & Edit) */}
      <FormModal
        visible={modal !== undefined}
        title={modal?.id ? `Edit Staff: ${modal.name}` : 'New Staff Member'}
        onClose={() => setModal(undefined)}
        footer={
          <>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => setModal(undefined)}>
              <Text style={formStyles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[formStyles.primaryBtn, saving && formStyles.disabled]}
              onPress={submit}
              disabled={saving}
            >
              <Text style={formStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save Staff'}</Text>
            </TouchableOpacity>
          </>
        }
      >
        <Text style={formStyles.label}>Full Name *</Text>
        <TextInput
          value={form.name}
          onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
          style={formStyles.input}
          placeholder="e.g. John Doe"
        />

        <Text style={formStyles.label}>Email Address *</Text>
        <TextInput
          value={form.email}
          onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
          keyboardType="email-address"
          autoCapitalize="none"
          style={formStyles.input}
          placeholder="staff@example.com"
        />

        <Text style={formStyles.label}>Phone Number</Text>
        <TextInput
          value={form.phone}
          onChangeText={(v) => {
            const cleaned = v.replace(/\D/g, '').slice(0, 10);
            setForm((p) => ({ ...p, phone: cleaned }));
          }}
          keyboardType="numeric"
          maxLength={10}
          style={formStyles.input}
          placeholder="10-digit mobile (e.g. 9876543210)"
        />

        <SelectField
          label="Role *"
          value={form.role_id}
          options={roles}
          required
          onChange={(v) => setForm((p) => ({ ...p, role_id: String(v) }))}
        />

        <Text style={formStyles.label}>{modal?.id ? 'Password (leave blank to keep current)' : 'Password *'}</Text>
        <TextInput
          value={form.password}
          onChangeText={(v) => setForm((p) => ({ ...p, password: v }))}
          secureTextEntry
          style={formStyles.input}
          placeholder="••••••••"
        />

        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </FormModal>

      {/* View Staff Detail Modal */}
      {viewStaff && (
        <FormModal
          visible
          title={`Staff: ${viewStaff.name}`}
          onClose={() => setViewStaff(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewStaff(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Name:</Text>
              <Text style={styles.detailVal}>{viewStaff.name}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email:</Text>
              <Text style={styles.detailVal}>{viewStaff.email}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Role:</Text>
              <Text style={styles.detailVal}>{viewStaff.role_name || viewStaff.role}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone:</Text>
              <Text style={styles.detailVal}>{viewStaff.phone || '-'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status:</Text>
              <Text style={styles.detailVal}>{viewStaff.status || 'Active'}</Text>
            </View>
          </View>
        </FormModal>
      )}
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
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  name: { fontWeight: '700', color: colors.ink },
  meta: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  actionsBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },
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
