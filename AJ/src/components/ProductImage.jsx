import { useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { resolveImageUrl } from '../utils/media';
import { colors } from '../theme/colors';

export function ProductImage({ path, size = 56, style }) {
  const [broken, setBroken] = useState(false);
  const url = path ? resolveImageUrl(path) : null;

  useEffect(() => {
    setBroken(false);
  }, [path]);

  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.2 }, style]}>
      {url && !broken ? (
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={{ fontSize: size * 0.35, color: colors.inkMuted, fontWeight: '700' }}>📦</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.page, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderSoft },
  placeholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page },
});
