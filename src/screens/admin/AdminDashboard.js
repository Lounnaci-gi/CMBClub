// src/screens/admin/AdminDashboard.js
import React, { useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import StatCard from '../../components/StatCard';
import useTheme from '../../theme/useTheme';

export default function AdminDashboard({ navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { user, stats, saisonActive, loadStats, loadSaisons, loadAdherents, loadRemises, loadConfig, logout } = useStore();
  const [refreshing, setRefreshing] = React.useState(false);

  const loadAll = useCallback(async () => {
    await Promise.all([loadSaisons(), loadAdherents(), loadRemises(), loadConfig()]);
    const saison = useStore.getState().saisonActive;
    if (saison) await loadStats(saison.id);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const quickActions = [
    { icon: 'account-plus', label: 'Nouvel adhérent', color: COLORS.primary, screen: 'AdherentForm' },
    { icon: 'cash-plus', label: 'Saisir paiement', color: COLORS.success, screen: 'PaymentList' },
    { icon: 'account-group', label: 'Adhérents', color: COLORS.secondary, screen: 'AdherentList' },
    { icon: 'calendar-star', label: 'Saisons', color: COLORS.catCadet, screen: 'Seasons' },
    { icon: 'percent', label: 'Remises', color: COLORS.catMinime, screen: 'Config' },
    { icon: 'cog', label: 'Paramètres', color: COLORS.textSecondary, screen: 'Config' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={[COLORS.bg, COLORS.bgCard]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.userName}>{user?.username || 'Admin'} 👋</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <MaterialCommunityIcons name="logout" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {saisonActive && (
          <View style={styles.saisonBadge}>
            <MaterialCommunityIcons name="calendar-check" size={14} color={COLORS.secondary} />
            <Text style={styles.saisonText}>Saison active : {saisonActive.label}</Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <Text style={styles.sectionTitle}>Statistiques de la saison</Text>
        <View style={styles.statsRow}>
          <StatCard icon="account-group" label="Adhérents" value={stats.nbAdherents} color={COLORS.primary} />
          <StatCard icon="cash-check" label="Encaissé" value={(stats.collected / 1000).toFixed(1)} suffix="k DA" color={COLORS.success} />
          <StatCard icon="alert-circle" label="Retards" value={stats.retards} color={COLORS.danger} />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[styles.actionCard, { borderColor: action.color + '30' }]}
              onPress={() => navigation.navigate(action.screen)}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                <MaterialCommunityIcons name={action.icon} size={26} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent activity section */}
        <Text style={styles.sectionTitle}>Module de gestion</Text>
        <View style={styles.menuList}>
          {[
            { icon: 'account-multiple', label: 'Liste des adhérents', sub: 'Filtrer, rechercher, voir fiches', screen: 'AdherentList', color: COLORS.primary },
            { icon: 'credit-card-multiple', label: 'Gestion des paiements', sub: 'Mensualités, inscriptions, retards', screen: 'PaymentList', color: COLORS.success },
            { icon: 'calendar-month', label: 'Gestion des saisons', sub: 'Créer et activer des saisons', screen: 'Seasons', color: COLORS.secondary },
            { icon: 'tune', label: 'Configuration', sub: 'Tarifs, remises, paramètres', screen: 'Config', color: COLORS.catMinime },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.8}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.color + '20' }]}>
                <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.menuText}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSub}>{item.sub}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
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
  headerContent: {
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
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  actionCard: {
    width: '30.5%',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    ...SHADOWS.card,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  menuList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: { flex: 1 },
  menuLabel: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 15 },
  menuSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
});
