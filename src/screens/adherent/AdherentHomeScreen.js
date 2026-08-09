// src/screens/adherent/AdherentHomeScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import PaymentCard from '../../components/PaymentCard';
import CategoryBadge from '../../components/CategoryBadge';
import useTheme from '../../theme/useTheme';
import { getCategoryByAge, calculateAge } from '../../utils/categories';
import { calculateBalance, PAYMENT_STATUS } from '../../utils/payments';
import { getAdherentById, getPaiementsByAdherent } from '../../database/database';

export default function AdherentHomeScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { user, saisonActive, loadSaisons, logout } = useStore();
  const [adherent, setAdherent] = useState(null);
  const [paiements, setPaiements] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await loadSaisons();
    const saison = useStore.getState().saisonActive;
    if (!user?.adherentId) return;
    const a = await getAdherentById(user.adherentId);
    setAdherent(a);
    if (a && saison) {
      const p = await getPaiementsByAdherent(a.id, saison.id);
      setPaiements(p);
    }
  }, [user?.adherentId, loadSaisons]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cat = adherent ? getCategoryByAge(adherent.dateNaissance) : null;
  const balance = calculateBalance(paiements);
  const retards = paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[COLORS.bg, COLORS.bgCard]} style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Mon espace</Text>
            <Text style={styles.userName}>
              {adherent ? `${adherent.prenom} ${adherent.nom}` : user?.username || 'Adhérent'}
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <MaterialCommunityIcons name="logout" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {saisonActive && (
          <View style={styles.saisonBadge}>
            <MaterialCommunityIcons name="calendar-check" size={14} color={COLORS.secondary} />
            <Text style={styles.saisonText}>Saison {saisonActive.label}</Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {!user?.adherentId ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="account-off" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Compte non lié</Text>
            <Text style={styles.emptyText}>
              Aucun profil adhérent n'est associé à ce compte. Contactez l'administrateur.
            </Text>
          </View>
        ) : (
          <>
            {/* Profile card */}
            {adherent && (
              <View style={styles.profileCard}>
                <View style={styles.avatar}>
                  {adherent.photo ? (
                    <Image source={{ uri: adherent.photo }} style={styles.photo} />
                  ) : (
                    <View style={[styles.photoPlaceholder, { backgroundColor: (cat?.color || COLORS.primary) + '25' }]}>
                      <Text style={{ fontSize: 28 }}>{cat?.icon || '👤'}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileCode}>{adherent.code}</Text>
                  {cat && <CategoryBadge category={cat.label} />}
                  <Text style={styles.profileMeta}>
                    {calculateAge(adherent.dateNaissance)} ans
                    {adherent.discipline ? ` · ${adherent.discipline}` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Balance */}
            <View style={styles.balanceCard}>
              <Text style={styles.sectionLabel}>Solde saison</Text>
              <View style={styles.balanceRow}>
                <View style={styles.balanceCol}>
                  <Text style={styles.balanceAmt}>{balance.totalDu.toLocaleString()}</Text>
                  <Text style={styles.balanceLbl}>Dû</Text>
                </View>
                <View style={styles.vDivider} />
                <View style={styles.balanceCol}>
                  <Text style={[styles.balanceAmt, { color: COLORS.success }]}>
                    {balance.totalPaye.toLocaleString()}
                  </Text>
                  <Text style={styles.balanceLbl}>Payé</Text>
                </View>
                <View style={styles.vDivider} />
                <View style={styles.balanceCol}>
                  <Text style={[styles.balanceAmt, { color: balance.solde > 0 ? COLORS.danger : COLORS.success }]}>
                    {balance.solde.toLocaleString()}
                  </Text>
                  <Text style={styles.balanceLbl}>Reste</Text>
                </View>
              </View>
              {retards.length > 0 && (
                <View style={styles.alertBox}>
                  <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.danger} />
                  <Text style={styles.alertText}>
                    {retards.length} paiement{retards.length > 1 ? 's' : ''} en retard
                  </Text>
                </View>
              )}
            </View>

            {/* Payments */}
            <Text style={styles.sectionTitle}>Mes paiements</Text>
            <View style={styles.list}>
              {paiements.length === 0 ? (
                <Text style={styles.emptyText}>Aucun paiement pour cette saison</Text>
              ) : (
                paiements.map(p => (
                  <PaymentCard key={p.id} paiement={p} />
                ))
              )}
            </View>
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
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: { color: COLORS.textSecondary, fontSize: 14 },
  userName: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '800' },
  logoutBtn: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.full,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  saisonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.secondary + '15',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.secondary + '30',
  },
  saisonText: { color: COLORS.secondary, fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  avatar: { width: 72, height: 72 },
  photo: { width: 72, height: 72, borderRadius: 36 },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1, gap: 6 },
  profileCode: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  profileMeta: { color: COLORS.textMuted, fontSize: 13 },
  balanceCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...SHADOWS.card,
  },
  sectionLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceCol: { flex: 1, alignItems: 'center', gap: 4 },
  balanceAmt: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  balanceLbl: { color: COLORS.textMuted, fontSize: 12 },
  vDivider: { width: 1, height: 36, backgroundColor: COLORS.border },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.danger + '15',
    borderRadius: RADIUS.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
  },
  alertText: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  list: { paddingHorizontal: 16, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
