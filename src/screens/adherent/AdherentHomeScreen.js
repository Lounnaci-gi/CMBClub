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
import useTheme, { useResponsive } from '../../theme/useTheme';
import { getEffectiveCategory, calculateAge } from '../../utils/categories';
import { calculateBalance } from '../../utils/payments';
import { getAdherentById, getPaiementsByAdherent, getPresencesByAdherent } from '../../database/database';
import CategoryBadge from '../../components/CategoryBadge';
import AdherentCardModal from '../../components/AdherentCardModal';

export default function AdherentHomeScreen({ navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const { isSmall, isTablet, isDesktop, horizontalPadding } = useResponsive();
  const isLarge = isTablet || isDesktop;
  const styles = useMemo(
    () => createStyles(COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding),
    [COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding],
  );

  const { user, saisonActive, creneaux, loadSaisons, loadCreneaux, logout } = useStore();

  const [adherent, setAdherent]         = useState(null);
  const [paiements, setPaiements]       = useState([]);
  const [presencesData, setPresencesData] = useState(null);
  const [refreshing, setRefreshing]     = useState(false);
  const [showCard, setShowCard]         = useState(false);

  const load = useCallback(async () => {
    await Promise.all([loadSaisons(), loadCreneaux()]);
    const saison = useStore.getState().saisonActive;
    if (!user?.adherentId) return;
    const a = await getAdherentById(user.adherentId);
    setAdherent(a);
    if (a) {
      const [p, pres] = await Promise.all([
        saison ? getPaiementsByAdherent(a.id, saison.id) : Promise.resolve([]),
        getPresencesByAdherent(a.id, saison?.id),
      ]);
      setPaiements(p);
      setPresencesData(pres);
    }
  }, [user?.adherentId, loadSaisons, loadCreneaux]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cat     = adherent ? getEffectiveCategory(adherent) : null;
  const balance = calculateBalance(paiements);
  const tauxColor = presencesData
    ? (presencesData.tauxPresence >= 80 ? COLORS.success
        : presencesData.tauxPresence >= 50 ? COLORS.warning
        : COLORS.danger)
    : COLORS.textMuted;

  // Créneaux du jour
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
  const todayStr = today.charAt(0).toUpperCase() + today.slice(1);
  const todayCreneaux = useMemo(() =>
    creneaux.filter(c => c.jour === todayStr),
    [creneaux, todayStr]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header gradient */}
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
              {/* ── Carte profil ── */}
              {adherent && (
                <View style={styles.profileCard}>
                  <TouchableOpacity onPress={() => setShowCard(true)} activeOpacity={0.85}>
                    {adherent.photo ? (
                      <Image source={{ uri: adherent.photo }} style={styles.photo} />
                    ) : (
                      <View style={[styles.photoPlaceholder, { backgroundColor: (cat?.color || COLORS.primary) + '25' }]}>
                        <Text style={{ fontSize: 32 }}>{cat?.icon || '👤'}</Text>
                      </View>
                    )}
                    <View style={styles.cardIconBadge}>
                      <MaterialCommunityIcons name="card-account-details" size={13} color="#fff" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{adherent.prenom} {adherent.nom}</Text>
                    <Text style={styles.profileCode}>{adherent.code}</Text>
                    {cat && <CategoryBadge category={cat.label} />}
                    <Text style={styles.profileMeta}>
                      {calculateAge(adherent.dateNaissance)} ans
                      {adherent.discipline ? ` · ${adherent.discipline}` : ''}
                    </Text>
                  </View>
                </View>
              )}

              {/* ── 3 tuiles de résumé ── */}
              <View style={styles.tilesRow}>
                {/* Présences */}
                <TouchableOpacity
                  style={styles.tile}
                  onPress={() => navigation.navigate('MesPresences')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="clipboard-check-outline" size={24} color={tauxColor} />
                  <Text style={[styles.tilePct, { color: tauxColor }]}>
                    {presencesData ? `${presencesData.tauxPresence}%` : '—'}
                  </Text>
                  <Text style={styles.tileLbl}>Assiduité</Text>
                </TouchableOpacity>

                {/* Paiements */}
                <TouchableOpacity
                  style={styles.tile}
                  onPress={() => navigation.navigate('MesPaiements')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="cash-check"
                    size={24}
                    color={balance.resteAVerser > 0 ? COLORS.warning : COLORS.success}
                  />
                  <Text style={[styles.tilePct, { color: balance.resteAVerser > 0 ? COLORS.warning : COLORS.success }]}>
                    {balance.nbMoisPayes}/{balance.totalMoisCibles}
                  </Text>
                  <Text style={styles.tileLbl}>Mois payés</Text>
                </TouchableOpacity>

                {/* Créneaux aujourd'hui */}
                <TouchableOpacity
                  style={styles.tile}
                  onPress={() => navigation.navigate('MesCreneaux')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="calendar-today" size={24} color={COLORS.primary} />
                  <Text style={[styles.tilePct, { color: COLORS.primary }]}>
                    {todayCreneaux.length}
                  </Text>
                  <Text style={styles.tileLbl}>Séance(s) auj.</Text>
                </TouchableOpacity>
              </View>

              {/* ── Créneaux du jour ── */}
              {todayCreneaux.length > 0 && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons name="calendar-today" size={16} color={COLORS.primary} />
                    <Text style={styles.sectionTitle}>Séances aujourd'hui — {todayStr}</Text>
                  </View>
                  {todayCreneaux.map(c => (
                    <View key={c.id} style={styles.creneauRow}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color={COLORS.secondary} />
                      <Text style={styles.creneauTime}>{c.heureDebut} – {c.heureFin}</Text>
                      <Text style={styles.creneauMeta}>{c.discipline}{c.lieu ? ` · 📍 ${c.lieu}` : ''}</Text>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => navigation.navigate('MesCreneaux')} style={styles.voirToutBtn}>
                    <Text style={styles.voirToutText}>Voir tous mes créneaux →</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Dernière présence ── */}
              {presencesData?.list?.length > 0 && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons name="clipboard-check-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.sectionTitle}>Dernières séances</Text>
                  </View>
                  {presencesData.list.slice(0, 3).map(p => {
                    const isPresent = p.statut === 'present';
                    const isAbsent  = p.statut === 'absent';
                    const isRetard  = p.statut === 'retard';
                    const color = isPresent ? COLORS.success : isAbsent ? COLORS.danger : isRetard ? COLORS.warning : COLORS.secondary;
                    const label = isPresent ? 'Présent' : isAbsent ? 'Absent' : isRetard ? 'Retard' : 'Excusé';
                    return (
                      <View key={p.id} style={styles.presRow}>
                        <MaterialCommunityIcons
                          name={isPresent ? 'check-circle' : isAbsent ? 'close-circle' : isRetard ? 'clock-alert' : 'account-check'}
                          size={16}
                          color={color}
                        />
                        <Text style={styles.presDate}>{p.dateSeance}</Text>
                        <View style={[styles.presBadge, { backgroundColor: color + '20' }]}>
                          <Text style={[styles.presBadgeText, { color }]}>{label}</Text>
                        </View>
                      </View>
                    );
                  })}
                  <TouchableOpacity onPress={() => navigation.navigate('MesPresences')} style={styles.voirToutBtn}>
                    <Text style={styles.voirToutText}>Voir toutes mes présences →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      {adherent && (
        <AdherentCardModal
          visible={showCard}
          adherent={adherent}
          onClose={() => setShowCard(false)}
        />
      )}
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 56, paddingHorizontal: horizontalPadding, paddingBottom: 20 },
  headerInner: { width: '100%', maxWidth: 840, alignSelf: 'center', gap: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
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
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.secondary + '15',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: COLORS.secondary + '30',
  },
  saisonText: { color: COLORS.secondary, fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { alignItems: 'center' },
  bodyWrapper: { width: '100%', maxWidth: 840, padding: 16, gap: 14 },

  /* Profil */
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  photo: { width: 72, height: 72, borderRadius: 36 },
  photoPlaceholder: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconBadge: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' },
  profileCode: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  profileMeta: { color: COLORS.textMuted, fontSize: 13 },

  /* Tuiles */
  tilesRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  tilePct: { fontSize: 20, fontWeight: '900' },
  tileLbl: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  /* Section cards */
  sectionCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    gap: 10, ...SHADOWS.card,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  creneauRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  creneauTime: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  creneauMeta: { color: COLORS.textMuted, fontSize: 12, flex: 1 },
  voirToutBtn: { paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border + '50' },
  voirToutText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },

  /* Présences résumé */
  presRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  presDate: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600', flex: 1 },
  presBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  presBadgeText: { fontSize: 11, fontWeight: '700' },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
