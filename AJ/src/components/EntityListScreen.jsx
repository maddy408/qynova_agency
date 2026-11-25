import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, Switch, ScrollView, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { friendlyErrorMessage } from '../api/client';
import { FormModal, formStyles } from './FormModal';
import { ExcelToolbar } from './ExcelToolbar';
import { ImportExcelModal } from './ImportExcelModal';
import { Icon } from './Icon';
import { colors } from '../theme/colors';

/**
 * Generic add/edit/delete/view list for simple lookup entities (categories,
 * brands, routes, cities, tax codes, stock units, customers, …)
 *
 * `excelImport`, when given, renders the same Excel toolbar/import flow the
 * Products screen uses: { importApi, exportPath, exportFilename,
 * templatePath, templateFilename, rowLabel, successNoun }. Omit it (every
 * caller except customers today) and nothing Excel-related renders.
 */
export function EntityListScreen({ queryKey, api, title, fields, renderTitle, renderSubtitle, canManage = true, transformSubmit, excelImport }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null closed, {} create, {...row} edit
  const [viewItem, setViewItem] = useState(null);
  const [form, setForm] = useState({});
  const [touched, setTouched] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);

  const listQuery = useQuery({ queryKey: [queryKey], queryFn: api.list });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey] });

  const createMutation = useMutation({ mutationFn: api.create, onSuccess: () => { invalidate(); closeModal(); }, onError: (e) => setError(friendlyErrorMessage(e)) });
  const updateMutation = useMutation({ mutationFn: ({ id, data }) => api.update(id, data), onSuccess: () => { invalidate(); closeModal(); }, onError: (e) => setError(friendlyErrorMessage(e)) });
  const removeMutation = useMutation({
    mutationFn: api.remove,
    onSuccess: () => {
      invalidate();
      listQuery.refetch();
    },
    onError: (e) => Alert.alert('Delete Failed', friendlyErrorMessage(e)),
  });

  const openCreate = () => {
    setForm(Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'switch' ? 1 : '')])));
    setTouched({});
    setFieldErrors({});
    setError('');
    setModal({});
  };

  const openEdit = (row) => {
    setForm(Object.fromEntries(fields.map((f) => [f.name, f.type === 'switch' ? Number(row[f.name] ?? 1) : (row[f.name] ?? '')])));
    setTouched({});
    setFieldErrors({});
    setError('');
    setModal(row);
  };

  const openView = (row) => setViewItem(row);
  const closeModal = () => { setModal(null); setTouched({}); setFieldErrors({}); };

  const validateSingleField = (f, val) => {
    const strVal = String(val ?? '').trim();

    // Required field check
    if (f.required && !strVal) {
      return `${f.label.replace(/\*$/, '').trim()} is required.`;
    }

    // Phone / Mobile number validation
    if ((f.name === 'phone' || f.type === 'phone') && strVal) {
      if (!/^\d+$/.test(strVal)) {
        return 'Phone number must contain numeric digits only.';
      }
      if (strVal.length !== 10) {
        return `Mobile number must be exactly 10 digits (${strVal.length}/10).`;
      }
      if (!/^[6-9]/.test(strVal)) {
        return 'Mobile number must start with 6, 7, 8 or 9.';
      }
    }

    // Email validation
    if ((f.name === 'email' || f.type === 'email') && strVal) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
        return 'Please enter a valid email address.';
      }
    }

    // Numeric check
    if (f.keyboardType === 'numeric' && strVal) {
      const num = Number(strVal);
      if (isNaN(num)) {
        return `${f.label.replace(/\*$/, '').trim()} must be a valid number.`;
      }
      if (f.noNegative && num < 0) {
        return `${f.label.replace(/\*$/, '').trim()} cannot be negative.`;
      }
    }
    return '';
  };

  const handleFieldBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const f = fields.find((item) => item.name === fieldName);
    if (f) {
      const err = validateSingleField(f, form[fieldName]);
      setFieldErrors((prev) => ({ ...prev, [fieldName]: err }));
    }
  };

  const handleFieldChange = (fieldName, value) => {
    setForm((prev) => ({ ...prev, [fieldName]: value }));
    setError('');
    if (touched[fieldName]) {
      const f = fields.find((item) => item.name === fieldName);
      if (f) {
        const err = validateSingleField(f, value);
        setFieldErrors((prev) => ({ ...prev, [fieldName]: err }));
      }
    }
  };

  const validateAll = () => {
    const nextTouched = {};
    const nextErrors = {};
    let firstErrorMsg = '';

    for (const f of fields) {
      nextTouched[f.name] = true;
      const err = validateSingleField(f, form[f.name]);
      if (err) {
        nextErrors[f.name] = err;
        if (!firstErrorMsg) firstErrorMsg = err;
      }
    }
    setTouched(nextTouched);
    setFieldErrors(nextErrors);
    return firstErrorMsg;
  };

  const submit = () => {
    setError('');
    const validationError = validateAll();
    if (validationError) {
      setError(validationError);
      return;
    }
    const payload = transformSubmit ? transformSubmit(form) : form;
    if (modal && modal.id) {
      updateMutation.mutate({ id: modal.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const confirmDelete = (row) => {
    Alert.alert(
      `Delete ${title}?`,
      `Are you sure you want to delete "${renderTitle(row)}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeMutation.mutate(row.id) },
      ]
    );
  };

  const rows = listQuery.data || [];
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const titleMatch = renderTitle ? String(renderTitle(r) || '').toLowerCase().includes(q) : false;
      const subtitleMatch = renderSubtitle ? String(renderSubtitle(r) || '').toLowerCase().includes(q) : false;
      const idMatch = String(r.id || '') === q;
      const fieldMatch = fields.some((f) => {
        const v = r[f.name];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      });
      return titleMatch || subtitleMatch || idMatch || fieldMatch;
    });
  }, [rows, search, renderTitle, renderSubtitle, fields]);

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={styles.screen}>
      {/* Top Header Row with Title and Top-Right "+ Add [Title]" Button */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>{title}s</Text>
        {canManage && (
          <TouchableOpacity style={styles.topRightBtn} onPress={openCreate}>
            <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
            <Text style={styles.topRightBtnText}>+ Add {title}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Global Dynamic Search Input with Clear Button */}
      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${title.toLowerCase()}s...`}
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

      {excelImport && (
        <ExcelToolbar
          onGetList={() => queryClient.invalidateQueries({ queryKey: [queryKey] })}
          onImportPress={() => setImportOpen(true)}
          busy={excelBusy}
          setBusy={setExcelBusy}
          exportPath={excelImport.exportPath}
          exportFilename={excelImport.exportFilename}
          templatePath={excelImport.templatePath}
          templateFilename={excelImport.templateFilename}
        />
      )}

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        ListEmptyComponent={
          rows.length === 0 ? (
            <Text style={styles.empty}>No {title.toLowerCase()}s yet.</Text>
          ) : (
            <View style={styles.noResultsBox}>
              <Text style={styles.empty}>No {title.toLowerCase()}s match "{search}".</Text>
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => openView(item)}>
              <Text style={styles.rowTitle}>{renderTitle(item)}</Text>
              {renderSubtitle ? <Text style={styles.rowSubtitle}>{renderSubtitle(item)}</Text> : null}
            </TouchableOpacity>

            {/* Explicit CRUD Action Buttons: View, Edit, Delete */}
            <View style={styles.actionsBox}>
              <TouchableOpacity onPress={() => openView(item)} style={styles.actionBtn}>
                <Icon name="view" size={16} color={colors.inkMuted} />
              </TouchableOpacity>
              {canManage && (
                <>
                  <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
                    <Icon name="edit" size={16} color={colors.gold} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.actionBtn}>
                    <Icon name="delete" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      />

      {/* Form Modal (Create / Edit) */}
      <FormModal
        visible={!!modal}
        title={modal?.id ? `Edit ${title}` : `Add ${title}`}
        onClose={closeModal}
        footer={
          <>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={closeModal}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[formStyles.primaryBtn, saving && formStyles.disabled]} onPress={submit} disabled={saving}>
              <Text style={formStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </>
        }
      >
        {fields.map((f) => {
          const hasFieldError = touched[f.name] && !!fieldErrors[f.name];
          return (
            <View key={f.name} style={{ marginBottom: 12 }}>
              <Text style={formStyles.label}>
                {f.label} {f.required ? <Text style={{ color: colors.danger }}>*</Text> : null}
              </Text>
              {f.type === 'switch' ? (
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{form[f.name] ? 'Active' : 'Inactive'}</Text>
                  <Switch
                    value={!!form[f.name]}
                    onValueChange={(v) => {
                      handleFieldChange(f.name, v ? 1 : 0);
                    }}
                  />
                </View>
              ) : f.type === 'select' ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectRow}>
                    {(f.options || []).map((opt) => {
                      const optVal = opt.value !== undefined ? opt.value : opt.id;
                      const optLabel = opt.label !== undefined ? opt.label : (opt.name || opt.short_code);
                      const isSelected = String(form[f.name]) === String(optVal);
                      return (
                        <TouchableOpacity
                          key={String(optVal)}
                          onPress={() => {
                            handleFieldChange(f.name, optVal);
                            handleFieldBlur(f.name);
                          }}
                          style={[styles.selectChip, isSelected && styles.selectChipActive]}
                        >
                          <Text style={[styles.selectChipText, isSelected && styles.selectChipTextActive]}>{optLabel}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {hasFieldError && <Text style={styles.fieldErrorText}>{fieldErrors[f.name]}</Text>}
                </>
              ) : (
                <>
                  <TextInput
                    value={String(form[f.name] ?? '')}
                    onChangeText={(v) => handleFieldChange(f.name, v)}
                    onBlur={() => handleFieldBlur(f.name)}
                    keyboardType={f.keyboardType || 'default'}
                    placeholder={f.placeholder || `Enter ${f.label.replace(/\*$/, '').trim()}`}
                    placeholderTextColor={colors.inkMuted}
                    style={[
                      formStyles.input,
                      { color: colors.ink },
                      hasFieldError && styles.inputErrorBorder,
                    ]}
                  />
                  {hasFieldError && <Text style={styles.fieldErrorText}>{fieldErrors[f.name]}</Text>}
                </>
              )}
            </View>
          );
        })}
        {error ? <Text style={formStyles.error}>{error}</Text> : null}
      </FormModal>

      {/* View Detail Modal */}
      {viewItem && (
        <FormModal
          visible
          title={`View ${title}`}
          onClose={() => setViewItem(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewItem(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={styles.detailBox}>
            {fields.map((f) => {
              let val = viewItem[f.name];
              if (f.type === 'switch') {
                val = Number(val ?? 1) ? 'Active' : 'Inactive';
              } else if (f.type === 'select' && f.options) {
                const opt = f.options.find(
                  (o) => String(o.value !== undefined ? o.value : o.id) === String(val)
                );
                if (opt) val = opt.label || opt.name || val;
              }
              return (
                <View key={f.name} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{f.label.replace(/\*$/, '').trim()}:</Text>
                  <Text style={styles.detailVal}>{val !== null && val !== undefined && val !== '' ? String(val) : '-'}</Text>
                </View>
              );
            })}
          </View>
        </FormModal>
      )}

      {excelImport && importOpen && (
        <ImportExcelModal
          onClose={() => setImportOpen(false)}
          onImported={() => queryClient.invalidateQueries({ queryKey: [queryKey] })}
          api={excelImport.importApi}
          rowLabel={excelImport.rowLabel}
          successNoun={excelImport.successNoun}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  topRightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navbar,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  topRightBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
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
  clearSearchBtn: {
    padding: 6,
  },
  clearSearchText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40 },
  noResultsBox: { alignItems: 'center', marginTop: 30 },
  resetSearchBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.navbar,
  },
  resetSearchBtnText: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  rowTitle: { fontWeight: '600', color: colors.ink, fontSize: 14 },
  rowSubtitle: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  actionsBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },
  actionBtn: { padding: 4 },
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 13 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  fieldErrorText: { color: colors.danger, fontSize: 11, marginTop: 3, fontWeight: '600' },
  inputErrorBorder: { borderColor: colors.danger, borderWidth: 1.5 },
  switchLabel: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  selectRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  selectChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  selectChipActive: { backgroundColor: colors.navbar, borderColor: colors.navbar },
  selectChipText: { fontSize: 12, fontWeight: '600', color: colors.inkMuted },
  selectChipTextActive: { color: colors.gold },
});
