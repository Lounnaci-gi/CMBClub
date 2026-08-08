// src/screens/admin/AdherentListScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import FilterBar from '../../components/FilterBar';
import CategoryBadge from '../../components/CategoryBadge';
import { COLORS, RADIUS, SHADOWS } from '../../theme/colors';
import { CATEGORIES, DISCIPLINES, getCategoryByAge } from '../../utils/categories';
import { PAYMENT_STATUS, getStatusColor, getStatusLabel } from '../../utils/payments';
import { getPaymentStatusByAdherent } from '../../database/database';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous', icon: '👥' },
  { value: PAYMENT_STATUS.PAYE, label: 'À jour', icon: '✅', color: COLORS.success },
  { value: PAYMENT_STATUS.EN_RETARD, label: 'En retard', icon: '⚠️', color: COLORS.danger },
  { value: PAYMENT_STATUS.A_PAYER, label: 'À payer', icon: '🕐', color: COLORS.warning },
];

export default function AdherentListScreen({ navigation }) {
  const { adherents, loadAdherents, saisonActive, loadSaisons } = useStore();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [discFilter, setDiscFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [payStatusMap, setPayStatusMap] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await loadSaisons();
    await loadAdherents();
    const saison = useStore.getState().saisonActive;
    if (saison) {
      const map = await getPaymentStatusByAdherent(saison.id);
      setPayStatusMap(map);
    }
  }, [loadAdherents, loadSaisons]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const categoryFilters = useMemo(() => [
    { value: 'all', label: 'Toutes', icon: '📊' },
    ...CATEGORIES.map(c => ({ value: c.label, label: c.label, icon: c.icon, color: c.color })),
  ], []);

  const disciplineFilters = useMemo(() => [
    { value: 'all', label: 'Toutes' },
    ...DISCIPLINES.map(d => ({ value: d, label: d })),
  ], []);

  const filtered = useMemo(() => {
    return adherents.filter(a => {
      const cat = getCategoryByAge(a.dateNaissance);
      const fullName = `${a.nom} ${a.prenom} ${a.code}`.toLowerCase();

      if (search && !fullName.includes(search.toLowerCase())) return false;
      if (catFilter !== 'all' && cat.label !== catFilter) return false;
      if (discFilter !== 'all' && a.discipline !== discFilter) return false;
      if (payFilter !== 'all') {
        const st = payStatusMap[a.id];
        if (payFilter === PAYMENT_STATUS.PAYE && st !== PAYMENT_STATUS.PAYE) return false;
        if (payFilter === PAYMENT_STATUS.EN_RETARD && st !== PAYMENT_STATUS.EN_RETARD) return false;
        if (payFilter === PAYMENT_STATUS.A_PAYER && st !== PAYMENT_STATUS.A_PAYER) return false;
      }
      return true;
    });
  }, [adherents, search, catFilter, discFilter, payFilter, payStatusMap]);

  const renderItem = ({ item }) => {
    const cat = getCategoryByAge(item.dateNaissance);
    const payStatus = payStatusMap[item.id];
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('AdherentDetail', { adherentId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.avatar}>
          {item.photo ? (
            <Image source={{ uri: item.photo }} style={styles.photo} />
          ) : (
            <View style={[styles.photoPlaceholder, { backgroundColor: cat.color + '20' }]}>
              <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.prenom} {item.nom}</Text>
            <Text style={styles.code} numberOfLines={1}>{item.code}</Text>
          </View>
          <View style={styles.badges}>
            <CategoryBadge category={cat.label} size="sm" />
            {payStatus ? (
              <View style={[styles.payBadge, { backgroundColor: getStatusColor(payStatus) + '22' }]}>
                <Text style={[styles.payBadgeText, { color: getStatusColor(payStatus) }]}>
                  {getStatusLabel(payStatus)}
                </Text>
              </View>
            ) : null}
          </View>
          {item.discipline ? (
            <Text style={styles.discipline}>{item.discipline}</Text>
          ) : null}
        </View>

        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un adhérent..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.filterLabel}>Paiement</Text>
      <FilterBar filters={STATUS_FILTERS} activeFilter={payFilter} onSelect={setPayFilter} />
      <Text style={styles.filterLabel}>Catégorie</Text>
      <FilterBar filters={categoryFilters} activeFilter={catFilter} onSelect={setCatFilter} />
      <Text style={styles.filterLabel}>Discipline</Text>
      <FilterBar filters={disciplineFilters} activeFilter={discFilter} onSelect={setDiscFilter} />

      <Text style={styles.countText}>{filtered.length} adhérent{filtered.length > 1 ? 's' : ''}</Text>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="account-search" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucun adhérent trouvé</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AdherentForm')}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="account-plus" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    margin: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 15,
    paddingVertical: 12,
  },
  filterLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginTop: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  avatar: { width: 52, height: 52 },
  photo: { width: 52, height: 52, borderRadius: 26, resizeMode: 'cover' },
  photoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15, flex: 1 },
  code: {
    color: COLORS.textMuted,
    fontSize: 10,
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: '45%',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  payBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  payBadgeText: { fontSize: 11, fontWeight: '700' },
  discipline: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: COLORS.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.button,
  },
});
