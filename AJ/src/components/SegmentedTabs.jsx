import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * Equal-width tabs fill the bar as before for 2-4 tabs.
 * Beyond 4 tabs (e.g. Catalog's 6 sub-tabs), it switches to a horizontally-scrolling row.
 * Uses strict maxHeight and flex-none controls to prevent horizontal ScrollView from stretching vertically.
 */
export function SegmentedTabs({ tabs, active, onChange, style }) {
  const hasLongLabels = tabs.some((t) => (t.label || '').length > 8);
  const scrollable = tabs.length > 3 || (tabs.length >= 3 && hasLongLabels);

  const renderTab = (t) => {
    const isActive = active === t.key;
    return (
      <TouchableOpacity
        key={t.key}
        style={[
          styles.tabBase,
          scrollable ? styles.tabScrollable : styles.tabEqual,
          isActive && styles.tabActive,
        ]}
        onPress={() => onChange(t.key)}
        activeOpacity={0.75}
      >
        <Text style={isActive ? styles.textActive : styles.text} numberOfLines={1}>
          {t.label}
        </Text>
      </TouchableOpacity>
    );
  };

  if (scrollable) {
    return (
      <View style={[styles.scrollOuter, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollWrap}
          contentContainerStyle={styles.scrollContent}
        >
          {tabs.map(renderTab)}
        </ScrollView>
      </View>
    );
  }

  return <View style={[styles.wrap, style]}>{tabs.map(renderTab)}</View>;
}

const styles = StyleSheet.create({
  scrollOuter: {
    height: 46,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
  },
  scrollWrap: {
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    height: 44,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 6,
  },
  wrap: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    height: 44,
    alignItems: 'center',
  },
  tabBase: {
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabEqual: {
    flex: 1,
  },
  tabScrollable: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 16,
  },
  tabActive: {
    backgroundColor: colors.card,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  text: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  textActive: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
});
