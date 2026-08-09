// src/components/CategoryBadge.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useTheme from '../theme/useTheme';
import { CATEGORIES } from '../utils/categories';

export default function CategoryBadge({ category, size = 'md' }) {
  const { colors: COLORS, RADIUS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS), [COLORS, RADIUS]);
  const cat = CATEGORIES.find(c => c.label === category) || CATEGORIES[0];
  const isSmall = size === 'sm';

  return (
    <View style={[styles.badge, { backgroundColor: cat.color + '25', borderColor: cat.color }, isSmall && styles.small]}>
      <Text style={[styles.icon, isSmall && styles.iconSmall]}>{cat.icon}</Text>
      <Text style={[styles.label, { color: cat.color }, isSmall && styles.labelSmall]}>
        {cat.label}
      </Text>
    </View>
  );
}

const createStyles = (COLORS, RADIUS) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 4,
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  icon: { fontSize: 14 },
  iconSmall: { fontSize: 11 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  labelSmall: { fontSize: 11 },
});
