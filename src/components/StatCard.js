// src/components/StatCard.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useTheme, { useResponsive } from '../theme/useTheme';

export default function StatCard({ icon, label, value, color, suffix = '', style }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const { isSmall, isTablet, isDesktop } = useResponsive();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, isSmall, isTablet || isDesktop), [COLORS, RADIUS, isSmall, isTablet, isDesktop]);
  const resolvedColor = color ?? COLORS.primary;

  return (
    <View style={[styles.card, SHADOWS.card, style]}>
      <View style={[styles.iconBox, { backgroundColor: resolvedColor + '20' }]}>
        <MaterialCommunityIcons name={icon} size={isSmall ? 20 : 24} color={resolvedColor} />
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}{suffix}
      </Text>
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, isSmall, isLarge) => StyleSheet.create({
  card: {
    flex: 1,
    minWidth: isSmall ? '100%' : 100,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    paddingVertical: isSmall ? 12 : isLarge ? 20 : 16,
    paddingHorizontal: isSmall ? 10 : isLarge ? 16 : 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: isSmall ? 4 : 8,
  },
  iconBox: {
    width: isSmall ? 40 : isLarge ? 52 : 46,
    height: isSmall ? 40 : isLarge ? 52 : 46,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: COLORS.textPrimary,
    fontSize: isSmall ? 20 : isLarge ? 26 : 22,
    fontWeight: '800',
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: isSmall ? 11 : 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
