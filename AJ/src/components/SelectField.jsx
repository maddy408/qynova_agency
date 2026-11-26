import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, FlatList, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * A tappable field that opens a full-screen searchable list to pick one
 * option — replaces horizontal chip rows, which don't scale past a
 * handful of items and don't fit reliably on narrow screens.
 */
export function SelectField({ label, value, options = [], labelKey = 'name', valueKey = 'id', onChange, placeholder = '--', required }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const safeOptions = Array.isArray(options) ? options : [];

  const getItemVal = (o) => {
    if (o == null) return '';
    if (o[valueKey] !== undefined && o[valueKey] !== null) return o[valueKey];
    if (o.id !== undefined && o.id !== null) return o.id;
    if (o.item_id !== undefined && o.item_id !== null) return o.item_id;
    if (o.value !== undefined && o.value !== null) return o.value;
    return '';
  };

  const getItemLabel = (o) => {
    if (o == null) return '';
    return o[labelKey] || o.name || o.item_name || o.title || o.label || o.route_name || o.customer_name || o.supplier_name || String(getItemVal(o));
  };

  const selected = (value !== null && value !== undefined && value !== '')
    ? safeOptions.find((o) => String(getItemVal(o)) === String(value))
    : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return safeOptions;
    return safeOptions.filter((o) => {
      const labelVal = String(getItemLabel(o));
      const codeVal = String(o.item_code || o.code || o.short_code || o.barcode || o.phone || '');
      return labelVal.toLowerCase().includes(q) || codeVal.toLowerCase().includes(q);
    });
  }, [safeOptions, query, labelKey, valueKey]);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}{required ? ' *' : ''}</Text> : null}
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.fieldText : styles.placeholderText} numberOfLines={1}>
          {selected ? getItemLabel(selected) : placeholder}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label || 'Select'}</Text>
            <TouchableOpacity onPress={() => setOpen(false)}><Text style={styles.close}>✕</Text></TouchableOpacity>
          </View>
          <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Search…" style={styles.search} />
          <FlatList
            data={filtered}
            keyExtractor={(o, i) => String(getItemVal(o) || i)}
            ListEmptyComponent={<Text style={styles.empty}>No results.</Text>}
            renderItem={({ item }) => {
              const itemVal = getItemVal(item);
              const isSelected = String(itemVal) === String(value);
              const subInfo = [item.item_code || item.code, item.barcode, item.phone].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity
                  style={[styles.option, isSelected && styles.optionActive]}
                  onPress={() => { onChange(itemVal); setOpen(false); setQuery(''); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={isSelected ? styles.optionTextActive : styles.optionText}>
                      {getItemLabel(item)}
                    </Text>
                    {subInfo ? <Text style={styles.optionSubText}>{subInfo}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: colors.inkMuted, marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.card,
  },
  fieldText: { fontSize: 14, color: colors.ink, flex: 1 },
  placeholderText: { fontSize: 14, color: colors.inkMuted, flex: 1 },
  chevron: { fontSize: 14, color: colors.inkMuted, marginLeft: 8 },
  modalScreen: { flex: 1, backgroundColor: colors.page, paddingTop: 40 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  close: { fontSize: 18, color: colors.inkMuted, padding: 4 },
  search: {
    margin: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    fontSize: 14,
    color: colors.ink,
  },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40, fontSize: 13 },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  optionActive: { backgroundColor: '#F0FDF4' },
  optionText: { fontSize: 14, color: colors.ink },
  optionTextActive: { fontSize: 14, color: colors.success, fontWeight: '700' },
  optionSubText: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
});
