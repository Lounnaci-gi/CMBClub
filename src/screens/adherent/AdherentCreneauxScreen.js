// src/screens/adherent/AdherentCreneauxScreen.js
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { getAdherentById } from '../../database/database';
import { getEffectiveCategory } from '../../utils/categories';

const JOURS_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export default function AdherentCreneauxScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { user, creneaux, loadCreneaux } = useStore();

  const [adherent, setAdherent] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await loadCreneaux();
    if (user?.adherentId) {
      const a = await getAdherentById(user.adherentId);
      setAdherent(a);
    }
  }, [user?.adherentId, loadCreneaux]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cat = adherent ? getEffectiveCategory(adherent) : null;

  const myCreneaux = useMemo(() => {
    if (!adherent) return creneaux;
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

  const displayed = showAll ? creneaux : myCreneaux;

  const grouped = useMemo(() => {
    const map = {};
    displayed.forEach(c => {
      if (!map[c.jour]) map[c.jour] = [];
      map[c.jour].push(c);
    });
    return JOURS_ORDER.filter(j => map[j]?.length > 0).map(j => ({ jour: j, list: map[j] }));
  }, [displayed]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {showAll ? 'Tous les créneaux' : 'Mes créneaux'}
          </Text>
          {adherent && !showAll && (
            <Text style={styles.headerSub}>
              {adherent.discipline} · {cat?.label}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowAll(!showAll)}>
          <MaterialCommunityIcons
            name={showAll ? 'account-filter' : 'calendar-multiple'}
            size={15}
            color={COLORS.primary}
          />
          <Text style={styles.toggleBtnText}>{showAll ? 'Mes créneaux' : 'Tout voir'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {grouped.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="calendar-clock" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun créneau</Text>
            <Text style={styles.emptyText}>
              {showAll
                ? 'Aucun créneau configuré au club.'
                : `Aucun créneau pour ${adherent?.discipline || 'votre discipline'} (${cat?.label || 'votre catégorie'}).`}
            </Text>
          </View>
        ) : (
          grouped.map(group => (
            <View key={group.jour} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <MaterialCommunityIcons name="calendar-today" size={16} color={COLORS.primary} />
                <Text style={styles.dayTitle}>{group.jour}</Text>
                <View style={styles.dayCountBadge}>
                  <Text style={styles.dayCountText}>
                    {group.list.length} créneau{group.list.length > 1 ? 'x' : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.slotList}>
                {group.list.map((c, idx) => (
                  <View key={c.id} style={styles.slotItem}>
                    <View style={styles.slotIconBox}>
                      <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.secondary} />
                    </View>
                    <View style={styles.slotInfo}>
                      <View style={styles.slotTitleRow}>
                        <Text style={styles.slotTime}>{c.heureDebut} – {c.heureFin}</Text>
                        {group.list.length > 1 && (
                          <Text style={styles.seanceTag}>Séance {idx + 1}</Text>
                        )}
                      </View>
                      <Text style={styles.slotMeta}>
                        {c.discipline} · {c.categorie}
                        {c.lieu ? ` · 📍 ${c.lieu}` : ''}
                      </Text>
                      {c.remarque ? (
                        <Text style={styles.slotRemarque}>💡 {c.remarque}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '800' },
  headerSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  toggleBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  dayCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...SHADOWS.card,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + '60',
    paddingBottom: 8,
  },
  dayTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' },
  dayCountBadge: {
    marginLeft: 'auto',
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  dayCountText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  slotList: { gap: 8 },
  slotItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 10,
  },
  slotIconBox: {
    width: 36, height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  slotInfo: { flex: 1, gap: 3 },
  slotTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotTime: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  seanceTag: {
    color: COLORS.primary, fontSize: 11, fontWeight: '700',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm,
  },
  slotMeta: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  slotRemarque: { color: COLORS.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
