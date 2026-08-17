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
import useTheme, { useResponsive } from '../../theme/useTheme';
import { getCategoryByAge, getEffectiveCategory, calculateAge } from '../../utils/categories';
import { calculateBalance, PAYMENT_STATUS } from '../../utils/payments';
import { getAdherentById, getPaiementsByAdherent } from '../../database/database';

export default function AdherentHomeScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const { isSmall, isTablet, isDesktop, horizontalPadding } = useResponsive();
  const isLarge = isTablet || isDesktop;
  const styles = useMemo(
    () => createStyles(COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding),
    [COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding],
  );
  const { user, saisonActive, creneaux, loadSaisons, loadCreneaux, getPresencesAdherent, logout } = useStore();
  const [adherent, setAdherent] = useState(null);
  const [paiements, setPaiements] = useState([]);
  const [presencesData, setPresencesData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllCreneaux, setShowAllCreneaux] = useState(false);

  const load = useCallback(async () => {
    await Promise.all([loadSaisons(), loadCreneaux()]);
    const saison = useStore.getState().saisonActive;
    if (!user?.adherentId) return;
    const a = await getAdherentById(user.adherentId);
    setAdherent(a);
    if (a) {
      const p = saison ? await getPaiementsByAdherent(a.id, saison.id) : [];
      setPaiements(p);
      const pres = await getPresencesAdherent(a.id, saison?.id);
      setPresencesData(pres);
    }
  }, [user?.adherentId, loadSaisons, loadCreneaux, getPresencesAdherent]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cat = adherent ? getEffectiveCategory(adherent) : null;
  const balance = calculateBalance(paiements);
  const retards = paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD);

  const myCreneaux = useMemo(() => {
    if (!adherent) return [];
    return creneaux.filter(c => {
      const matchDisc = !adherent.discipline || c.discipline.toLowerCase() === adherent.discipline.toLowerCase();
      const slotCats = (c.categorie || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const matchCat = !cat ||
        slotCats.length === 0 ||
        slotCats.includes('tout') ||
        slotCats.includes('toutes') ||
        slotCats.includes(cat.label.toLowerCase());
      return matchDisc && matchCat;
    });
  }, [creneaux, adherent, cat]);

  const displayedCreneaux = showAllCreneaux ? creneaux : myCreneaux;

  const JOURS_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  const groupedCreneaux = useMemo(() => {
    const map = {};
    displayedCreneaux.forEach(c => {
      if (!map[c.jour]) map[c.jour] = [];
      map[c.jour].push(c);
    });
    return JOURS_ORDER
      .filter(j => map[j] && map[j].length > 0)
      .map(j => ({ jour: j, list: map[j] }));
  }, [displayedCreneaux]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[COLORS.bg, COLORS.bgCard]} style={styles.header}>
        <View style={styles.headerInner}>
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
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.bodyWrapper}>
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

            {/* Schedule Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleNoMargin}>
                {showAllCreneaux ? 'Tous les créneaux du club' : 'Mes horaires d\'entraînement'}
              </Text>
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => setShowAllCreneaux(!showAllCreneaux)}
              >
                <Text style={styles.toggleBtnText}>
                  {showAllCreneaux ? 'Mon planning' : 'Tout voir'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.creneauxContainer}>
              {groupedCreneaux.length === 0 ? (
                <View style={styles.emptyCreneauxCard}>
                  <MaterialCommunityIcons name="calendar-clock" size={32} color={COLORS.textMuted} />
                  <Text style={styles.emptyCreneauxText}>
                    {showAllCreneaux
                      ? 'Aucun créneau configuré au club'
                      : `Aucun créneau programmé pour ${adherent?.discipline || 'votre discipline'} (${cat?.label || 'votre catégorie'})`}
                  </Text>
                </View>
              ) : (
                groupedCreneaux.map((group) => (
                  <View key={group.jour} style={styles.dayGroupCard}>
                    <View style={styles.dayGroupHeader}>
                      <MaterialCommunityIcons name="calendar-today" size={16} color={COLORS.primary} />
                      <Text style={styles.dayGroupTitle}>{group.jour}</Text>
                      <View style={styles.dayGroupCountBadge}>
                        <Text style={styles.dayGroupCountText}>
                          {group.list.length} créneau{group.list.length > 1 ? 'x' : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.dayGroupList}>
                      {group.list.map((c, index) => (
                        <View key={c.id} style={styles.creneauCardItem}>
                          <View style={styles.creneauIconBox}>
                            <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.secondary} />
                          </View>
                          <View style={styles.creneauInfo}>
                            <View style={styles.creneauTitleRow}>
                              <Text style={styles.creneauTime}>{c.heureDebut} - {c.heureFin}</Text>
                              {group.list.length > 1 && (
                                <Text style={styles.seanceTag}>Séance {index + 1}</Text>
                              )}
                            </View>
                            <Text style={styles.creneauMeta}>
                              {c.discipline} · {c.categorie}
                              {c.lieu ? ` · 📍 ${c.lieu}` : ''}
                            </Text>
                            {c.remarque ? (
                              <Text style={styles.creneauRemarque}>💡 {c.remarque}</Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Attendance & Assiduité Section */}
            {presencesData && (
              <View style={styles.attendanceCard}>
                <View style={styles.attendanceHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionLabel}>Mon Assiduité & Présences</Text>
                    <Text style={styles.attendanceSub}>Relevé des séances cette saison</Text>
                  </View>
                  <View style={[
                    styles.tauxBadge,
                    { backgroundColor: (presencesData.tauxPresence >= 80 ? COLORS.success : presencesData.tauxPresence >= 50 ? COLORS.warning : COLORS.danger) + '20' }
                  ]}>
                    <Text style={[
                      styles.tauxText,
                      { color: presencesData.tauxPresence >= 80 ? COLORS.success : presencesData.tauxPresence >= 50 ? COLORS.warning : COLORS.danger }
                    ]}>
                      {presencesData.tauxPresence}%
                    </Text>
                  </View>
                </View>

                <View style={styles.attendanceRow}>
                  <View style={styles.attCol}>
                    <Text style={[styles.attAmt, { color: COLORS.success }]}>{presencesData.nbPresents}</Text>
                    <Text style={styles.attLbl}>Présent(s)</Text>
                  </View>
                  <View style={styles.vDivider} />
                  <View style={styles.attCol}>
                    <Text style={[styles.attAmt, { color: COLORS.danger }]}>{presencesData.nbAbsents}</Text>
                    <Text style={styles.attLbl}>Absent(s)</Text>
                  </View>
                  <View style={styles.vDivider} />
                  <View style={styles.attCol}>
                    <Text style={[styles.attAmt, { color: COLORS.warning }]}>{presencesData.nbRetards}</Text>
                    <Text style={styles.attLbl}>Retard(s)</Text>
                  </View>
                  <View style={styles.vDivider} />
                  <View style={styles.attCol}>
                    <Text style={[styles.attAmt, { color: COLORS.secondary }]}>{presencesData.nbExcuses}</Text>
                    <Text style={styles.attLbl}>Excusé(s)</Text>
                  </View>
                </View>

                {/* History List */}
                {presencesData.list.length > 0 && (
                  <View style={styles.historyList}>
                    <Text style={styles.historyTitle}>Dernières séances enregistrées :</Text>
                    {presencesData.list.slice(0, 4).map(p => {
                      const isPresent = p.statut === 'present';
                      const isAbsent = p.statut === 'absent';
                      const isRetard = p.statut === 'retard';
                      const color = isPresent ? COLORS.success : isAbsent ? COLORS.danger : isRetard ? COLORS.warning : COLORS.secondary;
                      const label = isPresent ? 'Présent' : isAbsent ? 'Absent' : isRetard ? 'Retard' : 'Excusé';

                      return (
                        <View key={p.id} style={styles.historyItem}>
                          <View style={styles.historyLeft}>
                            <MaterialCommunityIcons
                              name={isPresent ? 'check-circle' : isAbsent ? 'close-circle' : isRetard ? 'clock-alert' : 'account-check'}
                              size={18}
                              color={color}
                            />
                            <Text style={styles.historyDate}>{p.dateSeance}</Text>
                            <Text style={styles.historyJour}>({p.jour})</Text>
                          </View>
                          <View style={[styles.historyBadge, { backgroundColor: color + '20' }]}>
                            <Text style={[styles.historyBadgeText, { color }]}>{label}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Balance */}
            <View style={styles.balanceCard}>
              <Text style={styles.sectionLabel}>Bilan financier saison</Text>
              <View style={styles.balanceRow}>
                <View style={styles.balanceCol}>
                  <Text style={styles.balanceAmt}>{balance.totalDu.toLocaleString()}</Text>
                  <Text style={styles.balanceLbl}>Total dû (DA)</Text>
                </View>
                <View style={styles.vDivider} />
                <View style={styles.balanceCol}>
                  <Text style={[styles.balanceAmt, { color: COLORS.success }]}>
                    {balance.montantVerse.toLocaleString()}
                  </Text>
                  <Text style={styles.balanceLbl}>Montant versé (DA)</Text>
                </View>
                <View style={styles.vDivider} />
                <View style={styles.balanceCol}>
                  <Text style={[styles.balanceAmt, { color: balance.resteAVerser > 0 ? COLORS.danger : COLORS.success }]}>
                    {balance.resteAVerser.toLocaleString()}
                  </Text>
                  <Text style={styles.balanceLbl}>Reste à verser (DA)</Text>
                </View>
              </View>

              <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border + '50', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: '500' }}>
                  Mois ciblés par versement :
                </Text>
                <View style={{ backgroundColor: COLORS.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full }}>
                  <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>
                    {balance.nbMoisPayes} / {balance.totalMoisCibles} mois
                  </Text>
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
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingTop: 56,
    paddingHorizontal: horizontalPadding,
    paddingBottom: 20,
  },
  headerInner: {
    width: '100%',
    maxWidth: 840,
    alignSelf: 'center',
    gap: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: { color: COLORS.textSecondary, fontSize: 14 },
  userName: { color: COLORS.textPrimary, fontSize: isSmall ? 20 : isLarge ? 26 : 24, fontWeight: '800' },
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
  scrollContent: {
    alignItems: 'center',
  },
  bodyWrapper: {
    width: '100%',
    maxWidth: 840,
  },
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitleNoMargin: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  toggleBtn: {
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  dayGroupCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...SHADOWS.card,
  },
  dayGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '60',
    paddingBottom: 8,
  },
  dayGroupTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  dayGroupCountBadge: {
    marginLeft: 'auto',
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  dayGroupCountText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  dayGroupList: {
    gap: 8,
  },
  creneauCardItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 10,
  },
  seanceTag: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  creneauIconBox: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  creneauInfo: {
    flex: 1,
    gap: 3,
  },
  creneauTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creneauTime: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  creneauMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  creneauRemarque: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyCreneauxCard: {
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyCreneauxText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },

  /* Attendance styles */
  attendanceCard: {
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
  attendanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attendanceSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  tauxBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  tauxText: {
    fontSize: 15,
    fontWeight: '800',
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
  },
  attCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  attAmt: {
    fontSize: 16,
    fontWeight: '800',
  },
  attLbl: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  historyList: {
    marginTop: 4,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border + '60',
    paddingTop: 10,
  },
  historyTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyDate: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  historyJour: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  list: { paddingHorizontal: 16, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
