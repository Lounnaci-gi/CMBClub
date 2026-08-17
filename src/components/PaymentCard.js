// src/components/PaymentCard.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useTheme from '../theme/useTheme';
import { getStatusColor, getStatusLabel, getStatusIcon } from '../utils/payments';
import { formatDate } from '../utils/seasons';

function PaymentCard({ paiement, onPress, showAdherent = false }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const statusColor = getStatusColor(paiement.statut);
  const statusLabel = getStatusLabel(paiement.statut);
  const statusIcon = getStatusIcon(paiement.statut);
  const amountDu = paiement.montantDu || 0;
  const paidAmount = paiement.montantPaye || 0;
  const resteAmount = Math.max(0, amountDu - paidAmount);

  const displayStatusLabel = (paiement.statut !== 'paye' && paidAmount > 0)
    ? 'Partiel'
    : statusLabel;
  const displayStatusColor = (paiement.statut !== 'paye' && paidAmount > 0)
    ? COLORS.warning
    : statusColor;

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: displayStatusColor }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name={paiement.type === 'inscription' ? 'card-account-details' : 'calendar-month'}
            size={18}
            color={COLORS.primary}
          />
          <Text style={styles.label} numberOfLines={1}>{paiement.label}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: displayStatusColor + '20' }]}>
          <MaterialCommunityIcons name={statusIcon} size={13} color={displayStatusColor} />
          <Text style={[styles.statusText, { color: displayStatusColor }]}>{displayStatusLabel}</Text>
        </View>
      </View>

      {showAdherent && paiement.nom && (
        <Text style={styles.adherentName}>{paiement.prenom} {paiement.nom} · {paiement.code}</Text>
      )}

      <View style={styles.amounts}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Montant dû</Text>
          <Text style={styles.amountValue}>{amountDu.toLocaleString()} DA</Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Montant versé</Text>
          <Text style={[styles.amountValue, { color: displayStatusColor }]}>
            {paidAmount.toLocaleString()} DA
          </Text>
        </View>
        {resteAmount > 0 && paidAmount > 0 ? (
          <View style={styles.amountItem}>
            <Text style={styles.amountLabel}>Reste à verser</Text>
            <Text style={[styles.amountValue, { color: COLORS.danger }]}>
              {resteAmount.toLocaleString()} DA
            </Text>
          </View>
        ) : null}
      </View>

      {paiement.datePaiement && (
        <Text style={styles.date}>
          <MaterialCommunityIcons name="clock-outline" size={11} color={COLORS.textMuted} />
          {' '}Réglé le {formatDate(paiement.datePaiement)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: 14,
    marginVertical: 5,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  label: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  adherentName: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  amounts: {
    flexDirection: 'row',
    gap: 16,
  },
  amountItem: { gap: 2 },
  amountLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  amountValue: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  date: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
});

export default React.memo(PaymentCard);
