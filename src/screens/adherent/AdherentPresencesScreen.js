// src/screens/adherent/AdherentPresencesScreen.js
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { getPresencesByAdherent } from '../../database/database';

const STATUT_CONFIG = {
  present: { label: 'Présent',   icon: 'check-circle',  color: null /* success */ },
  absent:  { label: 'Absent',    icon: 'close-circle',  color: null /* danger  */ },
  retard:  { label: 'Retard',    icon: 'clock-alert',   color: null /* warning */ },
  excuse:  { label: 'Excusé',    icon: 'account-check', color: null /* secondary */ },
};

export default function AdherentPresencesScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { user, saisonActive, loadSaisons } = useStore();

  const [presencesData, setPresencesData] = useState(null);
  const [refreshing, setRefreshing]       = useState(false);

  // Résout la couleur par statut à l'exécution (COLORS est dynamique)
  const colorOf = useCallback((statut) => {
    if (statut === 'present') return COLORS.success;
    if (statut === 'absent')  return COLORS.danger;
    if (statut === 'retard')  return COLORS.warning;
    return COLORS.secondary;
  }, [COLORS]);

  const load = useCallback(async () => {
    await loadSaisons();
    const saison = useStore.getState().saisonActive;
    if (!user?.adherentId) return;
    const data = await getPresencesByAdherent(user.adherentId, saison?.id);
    setPresencesData(data);
  }, [user?.adherentId, loadSaisons]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const tauxColor = presencesData
    ? (presencesData.tauxPresence >= 80 ? COLORS.success : presencesData.tauxPresence >= 50 ? COLORS.warning : COLORS.danger)
    : COLORS.textMuted;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mes Présences</Text>
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
        {!presencesData ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="clipboard-clock-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucune donnée</Text>
            <Text style={styles.emptyText}>Aucune présence enregistrée pour cette saison.</Text>
          </View>
        ) : (
          <>
            {/* Taux global */}
            <View style={styles.tauxCard}>
              <View style={styles.tauxCircle}>
                <Text style={[styles.tauxPct, { color: tauxColor }]}>{presencesData.tauxPresence}%</Text>
                <Text style={styles.tauxLabel}>Assiduité</Text>
              </View>
              <View style={styles.countersGrid}>
                {[
                  { statut: 'present', count: presencesData.nbPresents,  label: 'Présent(s)' },
                  { statut: 'absent',  count: presencesData.nbAbsents,   label: 'Absent(s)'  },
                  { statut: 'retard',  count: presencesData.nbRetards,   label: 'Retard(s)'  },
                  { statut: 'excuse',  count: presencesData.nbExcuses,   label: 'Excusé(s)'  },
                ].map(({ statut, count, label }) => (
                  <View key={statut} style={styles.counterCell}>
                    <Text style={[styles.counterNum, { color: colorOf(statut) }]}>{count}</Text>
                    <Text style={styles.counterLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Barre de répartition */}
            {presencesData.total > 0 && (
              <View style={styles.barCard}>
                <Text style={styles.barTitle}>Répartition des {presencesData.total} séances</Text>
                <View style={styles.bar}>
                  {presencesData.nbPresents > 0 && (
                    <View style={[styles.barSegment, { flex: presencesData.nbPresents, backgroundColor: COLORS.success }]} />
                  )}
                  {presencesData.nbRetards > 0 && (
                    <View style={[styles.barSegment, { flex: presencesData.nbRetards, backgroundColor: COLORS.warning }]} />
                  )}
                  {presencesData.nbExcuses > 0 && (
                    <View style={[styles.barSegment, { flex: presencesData.nbExcuses, backgroundColor: COLORS.secondary }]} />
                  )}
                  {presencesData.nbAbsents > 0 && (
                    <View style={[styles.barSegment, { flex: presencesData.nbAbsents, backgroundColor: COLORS.danger }]} />
                  )}
                </View>
                <View style={styles.legend}>
                  {[
                    { label: 'Présent',  color: COLORS.success },
                    { label: 'Retard',   color: COLORS.warning },
                    { label: 'Excusé',   color: COLORS.secondary },
                    { label: 'Absent',   color: COLORS.danger },
                  ].map(({ label, color }) => (
                    <View key={label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: color }]} />
                      <Text style={styles.legendText}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Historique complet */}
            {presencesData.list.length > 0 && (
              <View style={styles.historyCard}>
                <Text style={styles.historyTitle}>Historique des séances</Text>
                {presencesData.list.map(p => {
                  const cfg = STATUT_CONFIG[p.statut] || STATUT_CONFIG.excuse;
                  const color = colorOf(p.statut);
                  return (
                    <View key={p.id} style={styles.historyItem}>
                      <View style={[styles.historyIconBox, { backgroundColor: color + '20' }]}>
                        <MaterialCommunityIcons name={cfg.icon} size={18} color={color} />
                      </View>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyDate}>{p.dateSeance}</Text>
                        <Text style={styles.historyMeta}>
                          {p.jour || ''}
                          {p.heureDebut ? ` · ${p.heureDebut}–${p.heureFin}` : ''}
                          {p.discipline ? ` · ${p.discipline}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.statutBadge, { backgroundColor: color + '20' }]}>
                        <Text style={[styles.statutBadgeText, { color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
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

  /* Taux */
  tauxCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    ...SHADOWS.card,
  },
  tauxCircle: {
    width: 90, height: 90,
    borderRadius: 45,
    borderWidth: 5,
    borderColor: COLORS.primary + '40',
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tauxPct: { fontSize: 22, fontWeight: '900' },
  tauxLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2 },
  countersGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  counterCell: { flex: 1, minWidth: '40%', alignItems: 'center', gap: 2 },
  counterNum: { fontSize: 20, fontWeight: '800' },
  counterLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },

  /* Barre répartition */
  barCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...SHADOWS.card,
  },
  barTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: COLORS.bgInput },
  barSegment: { height: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: COLORS.textMuted, fontSize: 11 },

  /* Historique */
  historyCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
    ...SHADOWS.card,
  },
  historyTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
  },
  historyIconBox: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  historyInfo: { flex: 1, gap: 2 },
  historyDate: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  historyMeta: { color: COLORS.textMuted, fontSize: 11 },
  statutBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm },
  statutBadgeText: { fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
