// src/screens/admin/PaymentListScreen.js
// Vue globale de tous les paiements par saison avec filtres de statut
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import PaymentCard from '../../components/PaymentCard';
import FilterBar from '../../components/FilterBar';
import { COLORS, RADIUS, SHADOWS } from '../../theme/colors';
import { getAllPaiementsBySaison, refreshPaymentStatuses } from '../../database/database';
import { PAYMENT_STATUS } from '../../utils/payments';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous', icon: '📋' },
  { value: PAYMENT_STATUS.EN_RETARD, label: 'En retard', icon: '⚠️', color: COLORS.danger },
  { value: PAYMENT_STATUS.A_PAYER, label: 'À payer', icon: '🕐', color: COLORS.warning },
  { value: PAYMENT_STATUS.PAYE, label: 'Payés', icon: '✅', color: COLORS.success },
];

export default function PaymentListScreen({ navigation }) {
  const { saisonActive, saisons, loadSaisons } = useStore();
  const [paiements, setPaiements] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSaisonId, setSelectedSaisonId] = useState(null);

  const saison = useMemo(() => {
    if (selectedSaisonId) return saisons.find(s => s.id === selectedSaisonId) || saisonActive;
    return saisonActive;
  }, [selectedSaisonId, saisons, saisonActive]);

  const load = useCallback(async () => {
    await loadSaisons();
    const s = selectedSaisonId
      ? useStore.getState().saisons.find(x => x.id === selectedSaisonId)
      : useStore.getState().saisonActive;
    if (s) {
      await refreshPaymentStatuses(s.id);
      const p = await getAllPaiementsBySaison(s.id);
      setPaiements(p);
    }
  }, [selectedSaisonId, loadSaisons]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return paiements;
    return paiements.filter(p => p.statut === statusFilter);
  }, [paiements, statusFilter]);

  const counts = useMemo(() => ({
    all: paiements.length,
    [PAYMENT_STATUS.EN_RETARD]: paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD).length,
    [PAYMENT_STATUS.A_PAYER]: paiements.filter(p => p.statut === PAYMENT_STATUS.A_PAYER).length,
    [PAYMENT_STATUS.PAYE]: paiements.filter(p => p.statut === PAYMENT_STATUS.PAYE).length,
  }), [paiements]);

  const totalCollected = useMemo(() =>
    paiements.filter(p => p.statut === PAYMENT_STATUS.PAYE).reduce((s, p) => s + (p.montantPaye || 0), 0),
    [paiements]
  );
  const totalRetard = useMemo(() =>
    paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD).reduce((s, p) => s + (p.montantDu - (p.remiseMontant || 0) - (p.montantPaye || 0)), 0),
    [paiements]
  );

  return (
    <View style={styles.container}>
      {saison && (
        <View style={styles.banner}>
          <View style={styles.bannerLeft}>
            <MaterialCommunityIcons name="calendar-check" size={18} color={COLORS.secondary} />
            <Text style={styles.bannerTitle}>{saison.label}</Text>
          </View>
          <View style={styles.bannerAmts}>
            <View style={styles.bannerAmt}>
              <Text style={styles.bannerAmtValue}>{totalCollected.toLocaleString()}</Text>
              <Text style={styles.bannerAmtLabel}>Encaissé (DA)</Text>
            </View>
            <View style={styles.bannerAmt}>
              <Text style={[styles.bannerAmtValue, { color: COLORS.danger }]}>{totalRetard.toLocaleString()}</Text>
              <Text style={styles.bannerAmtLabel}>Retard (DA)</Text>
            </View>
          </View>
        </View>
      )}

      {saisons.length > 1 && (
        <>
          <Text style={styles.filterLabel}>Saison</Text>
          <FilterBar
            filters={saisons.map(s => ({
              value: s.id,
              label: s.label,
              color: s.id === (saison?.id) ? COLORS.secondary : undefined,
            }))}
            activeFilter={saison?.id}
            onSelect={setSelectedSaisonId}
          />
        </>
      )}

      <FilterBar
        filters={STATUS_FILTERS.map(f => ({ ...f, count: counts[f.value] }))}
        activeFilter={statusFilter}
        onSelect={setStatusFilter}
      />

      <Text style={styles.countText}>{filtered.length} paiement{filtered.length > 1 ? 's' : ''}</Text>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PaymentCard
            paiement={item}
            showAdherent
            onPress={() => navigation.navigate('PaymentDetail', { adherentId: item.adherentId })}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="cash-remove" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucun paiement pour ce filtre</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  banner: {
    backgroundColor: COLORS.bgCard,
    margin: 16,
    marginBottom: 0,
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 16 },
  bannerAmts: { flexDirection: 'row', gap: 24 },
  bannerAmt: { gap: 2 },
  bannerAmtValue: { color: COLORS.success, fontWeight: '800', fontSize: 18 },
  bannerAmtLabel: { color: COLORS.textMuted, fontSize: 12 },
  filterLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginTop: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
});
