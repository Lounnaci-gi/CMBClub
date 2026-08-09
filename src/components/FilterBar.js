// src/components/FilterBar.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import useTheme from '../theme/useTheme';

export default function FilterBar({ filters, activeFilter, onSelect }) {
  const { colors: COLORS, RADIUS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS), [COLORS, RADIUS]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {filters.map((f) => {
        const isActive = activeFilter === f.value;
        return (
          <TouchableOpacity
            key={f.value}
            style={[styles.chip, isActive && { backgroundColor: (f.color || COLORS.primary) + '25', borderColor: f.color || COLORS.primary }]}
            onPress={() => onSelect(f.value)}
            activeOpacity={0.7}
          >
            {f.icon && <Text style={styles.chipIcon}>{f.icon}</Text>}
            <Text style={[styles.chipText, isActive && { color: f.color || COLORS.primary }]}>
              {f.label}
            </Text>
            {f.count !== undefined && (
              <View style={[styles.countBadge, { backgroundColor: isActive ? (f.color || COLORS.primary) : COLORS.border }]}>
                <Text style={styles.countText}>{f.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (COLORS, RADIUS) => StyleSheet.create({
  scroll: { flexGrow: 0 },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipIcon: { fontSize: 14 },
  chipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
