// src/screens/adherent/AdherentPaiementsScreen.js
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { getPaiementsByAdherent } from '../../database/database';
import PaymentCard from '../../components/PaymentCard';
import { calculateBalance, PAYMENT_STATUS } from '../../utils/payments';

export default function AdherentPaiementsScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { user, saisonActive, loadSaisons } = useStore();

  const [paiements, setPaiements] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await loadSaisons();
    const saison = useStore.getState().saisonActive;
    if (!user?.adherentId) return;
    const p = saison ? await getPaiementsByAdherent(user.adherentId, saison.id) : [];
    setPaiements(p);
  }, [user?.adherentId, loadSaisons]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const balance = calculateBalance(paiements);
  const retards = paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes Paiements</Text>
        {saisonActive && (
          <View style={styles.saisonBadge}>
            <MaterialCommunityIcons name="calendar-check" size={13} color={COLORS.secondary} />
            <Text style={styles.saisonText}>Saison {saisonActive.label}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Bilan financier */}
        <View style={styles.bilanCard}>
          <Text style={styles.bilanTitle}>Bilan financier</Text>
          <View style={styles.bilanRow}>
            <View style={styles.bilanCol}>
              <Text style={styles.bilanAmt}>{balance.totalDu.toLocaleString()}</Text>
              <Text style={styles.bilanLbl}>Total dû (DA)</Text>
            </View>
            <View style={styles.vDivider} />
            <View style={styles.bilanCol}>
              <Text style={[styles.bilanAmt, { color: COLORS.success }]}>
                {balance.montantVerse.toLocaleString()}
              </Text>
              <Text style={styles.bilanLbl}>Versé (DA)</Text>
            </View>
            <View style={styles.vDivider} />
            <View style={styles.bilanCol}>
              <Text style={[styles.bilanAmt, { color: balance.resteAVerser > 0 ? COLORS.danger : COLORS.success }]}>
                {balance.resteAVerser.toLocaleString()}
              </Text>
              <Text style={styles.bilanLbl}>Reste (DA)</Text>
            </View>
          </View>

          {/* Mois */}
          <View style={styles.moisRow}>
            <Text style={styles.moisLabel}>Mois couverts</Text>
            <View style={[styles.moisBadge, { backgroundColor: COLORS.primary + '15' }]}>
              <Text style={[styles.moisText, { color: COLORS.primary }]}>
                {balance.nbMoisPayes} / {balance.totalMoisCibles}
              </Text>
            </View>
          </View>

          {/* Barre de progression */}
          {balance.totalMoisCibles > 0 && (
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min((balance.nbMoisPayes / balance.totalMoisCibles) * 100, 100)}%`,
                    backgroundColor: balance.resteAVerser > 0 ? COLORS.warning : COLORS.success,
                  },
                ]}
              />
            </View>
          )}

          {/* Alerte retard */}
          {retards.length > 0 && (
            <View style={styles.alertBox}>
              <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.alertText}>
                {retards.length} paiement{retards.length > 1 ? 's' : ''} en retard
              </Text>
            </View>
          )}

          {/* Alerte renouvellement 7 jours */}
          {(() => {
            const now = new Date();
            const currentDay = now.getDate();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();
            const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
            const daysLeft = lastDayOfMonth - currentDay;
            if (daysLeft >= 0 && daysLeft <= 7) {
              return (
                <View style={[styles.alertBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'rgba(245, 158, 11, 0.35)' }]}>
                  <MaterialCommunityIcons name="calendar-clock" size={16} color="#F59E0B" />
                  <Text style={[styles.alertText, { color: '#F59E0B' }]}>
                    Votre mensualité expire dans {daysLeft} jour(s). Pensez à renouveler votre abonnement.
                  </Text>
                </View>
              );
            }
            return null;
          })()}
        </View>

        {/* Liste des paiements */}
        <Text style={styles.listTitle}>Détail des paiements</Text>

        {paiements.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="cash-remove" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun paiement</Text>
            <Text style={styles.emptyText}>Aucun paiement enregistré pour cette saison.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {paiements.map(p => (
              <PaymentCard key={p.id} paiement={p} />
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '800' },
  saisonBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.secondary + '15',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: RADIUS.full, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: COLORS.secondary + '30',
  },
  saisonText: { color: COLORS.secondary, fontSize: 12, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  /* Bilan */
  bilanCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
    ...SHADOWS.card,
  },
  bilanTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  bilanRow: { flexDirection: 'row', alignItems: 'center' },
  bilanCol: { flex: 1, alignItems: 'center', gap: 4 },
  bilanAmt: { color: COLORS.textPrimary, fontSize: 19, fontWeight: '800' },
  bilanLbl: { color: COLORS.textMuted, fontSize: 11 },
  vDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  moisRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border + '50',
  },
  moisLabel: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500' },
  moisBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  moisText: { fontSize: 12, fontWeight: '700' },
  progressBg: {
    height: 6, backgroundColor: COLORS.bgInput, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3 },
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.danger + '15',
    borderRadius: RADIUS.sm, padding: 10,
    borderWidth: 1, borderColor: COLORS.danger + '30',
  },
  alertText: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },

  listTitle: {
    color: COLORS.textPrimary, fontSize: 16, fontWeight: '700',
    marginTop: 4,
  },
  list: { gap: 10 },

  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
