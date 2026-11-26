import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { friendlyErrorMessage } from '../api/client';
import { downloadAndShareFile } from '../utils/fileExportService';
import { colors } from '../theme/colors';

/**
 * Get List / Download Sample Template / Import Excel / Export Excel toolbar.
 * Each action button is completely independent with its own loading and click handler.
 */
export function ExcelToolbar({
  onGetList,
  onImportPress,
  busy: externalBusy,
  setBusy: externalSetBusy,
  exportPath = '/items/export',
  exportFilename = 'items_export.xlsx',
  templatePath = '/items/import/template',
  templateFilename = 'items_import_template.xlsx',
}) {
  const [activeAction, setActiveAction] = useState(null); // 'list' | 'template' | 'export' | 'import' | null

  const handleGetList = async (e) => {
    e?.stopPropagation?.();
    if (activeAction) return;
    setActiveAction('list');
    try {
      if (onGetList) await onGetList();
    } catch (err) {
      Alert.alert('Error', friendlyErrorMessage(err));
    } finally {
      setActiveAction(null);
    }
  };

  const handleTemplate = async (e) => {
    e?.stopPropagation?.();
    if (activeAction) return;
    setActiveAction('template');
    if (externalSetBusy) externalSetBusy(true);
    try {
      await downloadAndShareFile(templatePath, templateFilename);
    } catch (err) {
      Alert.alert('Download Failed', friendlyErrorMessage(err));
    } finally {
      setActiveAction(null);
      if (externalSetBusy) externalSetBusy(false);
    }
  };

  const handleExport = async (e) => {
    e?.stopPropagation?.();
    if (activeAction) return;
    setActiveAction('export');
    if (externalSetBusy) externalSetBusy(true);
    try {
      await downloadAndShareFile(exportPath, exportFilename);
    } catch (err) {
      Alert.alert('Export Failed', friendlyErrorMessage(err));
    } finally {
      setActiveAction(null);
      if (externalSetBusy) externalSetBusy(false);
    }
  };

  const handleImport = (e) => {
    e?.stopPropagation?.();
    if (activeAction) return;
    if (onImportPress) onImportPress();
  };

  const isAnyBusy = !!activeAction || !!externalBusy;

  return (
    <View style={styles.toolbar}>
      <ToolbarBtn
        label="Get List"
        loading={activeAction === 'list'}
        onPress={handleGetList}
        disabled={isAnyBusy && activeAction !== 'list'}
      />
      <ToolbarBtn
        label="Sample Template"
        loading={activeAction === 'template'}
        onPress={handleTemplate}
        disabled={isAnyBusy && activeAction !== 'template'}
      />
      <ToolbarBtn
        label="Export Excel"
        loading={activeAction === 'export'}
        onPress={handleExport}
        disabled={isAnyBusy && activeAction !== 'export'}
      />
      <ToolbarBtn
        label="Import Excel"
        loading={false}
        onPress={handleImport}
        disabled={isAnyBusy}
      />
    </View>
  );
}

function ToolbarBtn({ label, loading, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.toolbarBtn, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      <View style={styles.btnContent}>
        {loading ? <ActivityIndicator size="small" color={colors.gold} style={{ marginRight: 6 }} /> : null}
        <Text style={styles.toolbarBtnText}>{loading ? 'Exporting...' : label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8, flexWrap: 'wrap' },
  toolbarBtn: { backgroundColor: colors.navbar, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnContent: { flexDirection: 'row', alignItems: 'center' },
  toolbarBtnText: { color: colors.gold, fontWeight: '700', fontSize: 11 },
  disabled: { opacity: 0.5 },
});
