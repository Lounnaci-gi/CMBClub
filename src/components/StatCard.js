// src/components/StatCard.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useTheme from '../theme/useTheme';

export default function StatCard({ icon, label, value, color, suffix = '' }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS), [COLORS, RADIUS]);
  const resolvedColor = color ?? COLORS.primary;

  return (
    <View style={[styles.card, SHADOWS.card]}>
      <View style={[styles.iconBox, { backgroundColor: resolvedColor + '20' }]}>
        <MaterialCommunityIcons name={icon} size={24} color={resolvedColor} />
      </View>
      <Text style={styles.value}>{value}{suffix}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const createStyles = (COLORS, RADIUS) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
