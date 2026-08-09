// src/components/DateField.js
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useTheme from '../theme/useTheme';
import { formatDate } from '../utils/seasons';

function parseIso(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(2010, 0, 1);
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DateField({
  label,
  value,
  onChange,
  required = false,
  error,
  maximumDate = new Date(),
  minimumDate = new Date(1950, 0, 1),
}) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const [show, setShow] = useState(false);

  const handleValueChange = (event, selected) => {
    if (Platform.OS === 'android') setShow(false);
    if (selected) onChange(toIso(selected));
  };

  const handleDismiss = () => {
    setShow(false);
  };

  return (
    <View style={styles.fieldGroup}>
      {label ? (
        <Text style={styles.fieldLabel}>
          {label}{required && <Text style={{ color: COLORS.danger }}> *</Text>}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.input, error && styles.inputError]}
        onPress={() => setShow(true)}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="calendar" size={18} color={COLORS.primary} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? formatDate(value) : 'Choisir une date'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      {error ? <Text style={styles.errorMsg}>{error}</Text> : null}

      {show && (
        <DateTimePicker
          value={parseIso(value)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          locale="fr-FR"
        />
      )}
      {Platform.OS === 'ios' && show && (
        <TouchableOpacity style={styles.doneBtn} onPress={() => setShow(false)}>
          <Text style={styles.doneText}>OK</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  fieldGroup: { gap: 6 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputError: { borderColor: COLORS.danger },
  value: { flex: 1, color: COLORS.textPrimary, fontSize: 15 },
  placeholder: { color: COLORS.textMuted },
  errorMsg: { color: COLORS.danger, fontSize: 12 },
  doneBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    marginTop: 4,
  },
  doneText: { color: '#fff', fontWeight: '700' },
});
