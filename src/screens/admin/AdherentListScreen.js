// src/screens/admin/AdherentListScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, RefreshControl, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import * as Print from 'expo-print';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import CategoryBadge from '../../components/CategoryBadge';
import useTheme from '../../theme/useTheme';
import { CATEGORIES, DISCIPLINES, getCategoryByAge } from '../../utils/categories';
import { PAYMENT_STATUS, getStatusColor, getStatusLabel } from '../../utils/payments';
import { formatDate } from '../../utils/seasons';
import { getPaymentStatusByAdherent } from '../../database/database';

export default function AdherentListScreen({ navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const STATUS_FILTERS = useMemo(() => [
    { value: 'all',                       label: 'Tous',       icon: '👥' },
    { value: PAYMENT_STATUS.PAYE,         label: 'À jour',     icon: '✅', color: COLORS.success },
    { value: PAYMENT_STATUS.AVANCE,       label: 'Partiel',    icon: '🔵', color: COLORS.info },
    { value: PAYMENT_STATUS.EN_RETARD,    label: 'En retard',  icon: '⚠️', color: COLORS.danger },
    { value: PAYMENT_STATUS.A_PAYER,      label: 'Non payé',   icon: '🕐', color: COLORS.warning },
  ], [COLORS]);

  const { adherents, loadAdherents, saisonActive, loadSaisons, disciplines, loadDisciplines } = useStore();

  const [search,      setSearch]      = useState('');
  const [catFilter,   setCatFilter]   = useState('all');
  const [discFilter,  setDiscFilter]  = useState('all');
  const [payFilter,   setPayFilter]   = useState('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [assureFilter, setAssureFilter] = useState('all');
  const [payStatusMap, setPayStatusMap] = useState({});
  const [refreshing,  setRefreshing]  = useState(false);
  const [printing,    setPrinting]    = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    await loadSaisons();
    await loadAdherents();
    await loadDisciplines();
    const saison = useStore.getState().saisonActive;
    if (saison) {
      const map = await getPaymentStatusByAdherent(saison.id);
      setPayStatusMap(map);
    }
  }, [loadAdherents, loadSaisons, loadDisciplines]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Filter options ────────────────────────────────────────────────────────
  const categoryFilters = useMemo(() => [
    { value: 'all', label: 'Toutes' },
    ...CATEGORIES.map(c => ({ value: c.label, label: c.label, icon: c.icon, color: c.color })),
  ], []);

  const disciplineFilters = useMemo(() => {
    const list = (disciplines && disciplines.length > 0)
      ? disciplines.map(d => d.nom)
      : DISCIPLINES;
    return [
      { value: 'all', label: 'Toutes' },
      ...list.map(d => ({ value: d, label: d })),
    ];
  }, [disciplines]);

  const GENRE_FILTERS = [
    { value: 'all', label: 'Tous',     icon: '👥' },
    { value: 'M',   label: 'Masculin', icon: '♂' },
    { value: 'F',   label: 'Féminin',  icon: '♀' },
  ];

  const ASSURANCE_FILTERS = [
    { value: 'all',        label: 'Tous',        icon: '👥' },
    { value: 'assure',     label: 'Assurés 🛡️',  icon: '🛡️', color: COLORS.success },
    { value: 'non_assure', label: 'Non assurés', icon: '❌', color: COLORS.danger },
  ];

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return adherents.filter(a => {
      const cat      = getCategoryByAge(a.dateNaissance);
      const fullName = `${a.nom} ${a.prenom} ${a.code}`.toLowerCase();
      if (search && !fullName.includes(search.toLowerCase())) return false;
      if (catFilter   !== 'all' && cat.label    !== catFilter)   return false;
      if (discFilter  !== 'all' && a.discipline !== discFilter)   return false;
      if (genreFilter !== 'all' && a.genre      !== genreFilter)  return false;
      if (assureFilter === 'assure' && !a.assure) return false;
      if (assureFilter === 'non_assure' && a.assure) return false;
      if (payFilter   !== 'all') {
        if (payStatusMap[a.id] !== payFilter) return false;
      }
      return true;
    });
  }, [adherents, search, catFilter, discFilter, payFilter, genreFilter, assureFilter, payStatusMap]);

  const activeFiltersCount = [catFilter, discFilter, payFilter, genreFilter, assureFilter]
    .filter(f => f !== 'all').length + (search ? 1 : 0);

  const clearAllFilters = () => {
    setCatFilter('all');
    setDiscFilter('all');
    setPayFilter('all');
    setGenreFilter('all');
    setAssureFilter('all');
    setSearch('');
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrintList = async () => {
    if (filtered.length === 0) {
      Alert.alert('Information', 'Aucun adhérent à imprimer avec les filtres actuels.');
      return;
    }
    setPrinting(true);
    try {
      const now        = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const saisonText = saisonActive ? saisonActive.label : 'N/A';
      const catText    = catFilter  === 'all' ? 'Toutes' : catFilter;
      const discText   = discFilter === 'all' ? 'Toutes' : discFilter;
      const payText    = payFilter  === 'all' ? 'Tous'   : getStatusLabel(payFilter);

      const rowsHtml = filtered.map((item, index) => {
        const cat     = getCategoryByAge(item.dateNaissance);
        const st      = payStatusMap[item.id];
        const stLabel = st ? getStatusLabel(st) : '—';
        const stColor = st ? getStatusColor(st) : '#888';
        return `
          <tr style="border-bottom:1px solid #E2E8F0">
            <td style="padding:8px 10px;text-align:center;color:#64748B;font-weight:600">${index + 1}</td>
            <td style="padding:8px 10px;font-family:monospace;font-weight:700">${item.code}</td>
            <td style="padding:8px 10px;font-weight:700">${item.nom.toUpperCase()} ${item.prenom}</td>
            <td style="padding:8px 10px">${cat.label}</td>
            <td style="padding:8px 10px;color:#0284C7;font-weight:600">${item.discipline || '—'}</td>
            <td style="padding:8px 10px">${formatDate(item.dateNaissance)}</td>
            <td style="padding:8px 10px">${item.telephone || '—'}</td>
            <td style="padding:8px 10px">
              <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:${stColor};background:${stColor}18;border:1px solid ${stColor}40">${stLabel}</span>
            </td>
          </tr>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
          @page{size:A4 landscape;margin:12mm}
          body{font-family:Arial,sans-serif;font-size:11.5px;margin:0;padding:10px}
          .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1DD1A1;padding-bottom:12px;margin-bottom:15px}
          h1{margin:0;font-size:22px;font-weight:900}
          .badge{display:inline-block;background:#0A1520;color:#1DD1A1;font-weight:700;padding:3px 10px;border-radius:12px}
          .filters{display:flex;gap:15px;background:#F8FAFC;border:1px solid #E2E8F0;padding:8px 14px;border-radius:8px;margin-bottom:15px}
          table{width:100%;border-collapse:collapse}
          th{background:#0A1520;color:#fff;text-align:left;padding:10px;text-transform:uppercase;letter-spacing:.5px}
          .footer{margin-top:20px;display:flex;justify-content:space-between;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px}
        </style></head><body>
        <div class="header">
          <div><h1>🏆 CMB CLUB — LISTE DES ADHÉRENTS</h1><p>Club Omnisports CMB</p></div>
          <div style="text-align:right">
            <div class="badge">Saison ${saisonText}</div>
            <div>Imprimé le : ${now}</div>
            <div>Total : <strong>${filtered.length}</strong></div>
          </div>
        </div>
        <div class="filters">
          <span><b>Catégorie :</b> ${catText}</span>
          <span><b>Discipline :</b> ${discText}</span>
          <span><b>Paiement :</b> ${payText}</span>
          ${search ? `<span><b>Recherche :</b> "${search}"</span>` : ''}
        </div>
        <table>
          <thead><tr>
            <th style="width:30px;text-align:center">#</th>
            <th style="width:90px">Code</th>
            <th>Nom & Prénom</th><th>Catégorie</th><th>Discipline</th>
            <th>Date Naiss.</th><th>Téléphone</th><th>Statut</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer"><div>CMBClub App v1.0</div><div>Page 1 / 1</div></div>
      </body></html>`;

      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert("Erreur d'impression", e.message);
    } finally {
      setPrinting(false);
    }
  };

  // ── Chip helpers ──────────────────────────────────────────────────────────
  const renderChip = ({ value, label, icon, color }, active, onPress) => (
    <TouchableOpacity
      key={value}
      style={[
        styles.filterChip,
        active && styles.filterChipActive,
        active && color && { borderColor: color, backgroundColor: color + '28' },
      ]}
      onPress={onPress}
    >
      {icon ? <Text style={styles.filterChipIcon}>{icon}</Text> : null}
      <Text style={[
        styles.filterChipText,
        active && styles.filterChipTextActive,
        active && color && { color },
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // ── Card ──────────────────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const cat       = getCategoryByAge(item.dateNaissance);
    const payStatus = payStatusMap[item.id];
    const isFemme   = item.genre === 'F';
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
            <View style={[styles.photoPlaceholder, { backgroundColor: cat.color + '22' }]}>
              <Text style={{ fontSize: 22 }}>{cat.icon}</Text>
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

            <View style={[styles.genreBadge, { backgroundColor: isFemme ? '#FF6B9D22' : COLORS.primary + '22' }]}>
              <Text style={[styles.genreBadgeText, { color: isFemme ? '#FF6B9D' : COLORS.primary }]}>
                {isFemme ? '♀ Féminin' : '♂ Masculin'}
              </Text>
            </View>

            {payStatus ? (
              <View style={[styles.payBadge, { backgroundColor: getStatusColor(payStatus) + '22' }]}>
                <Text style={[styles.payBadgeText, { color: getStatusColor(payStatus) }]}>
                  {getStatusLabel(payStatus)}
                </Text>
              </View>
            ) : null}

            <View style={[styles.payBadge, { backgroundColor: (item.assure ? COLORS.success : COLORS.textMuted) + '22' }]}>
              <Text style={[styles.payBadgeText, { color: item.assure ? COLORS.success : COLORS.textMuted }]}>
                {item.assure ? '🛡️ Assuré' : 'Non assuré'}
              </Text>
            </View>
          </View>

          {item.discipline ? (
            <Text style={styles.discipline}>🥊 {item.discipline}</Text>
          ) : null}
        </View>

        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Top bar: search + filter toggle */}
      <View style={styles.topBar}>
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

        <TouchableOpacity
          style={[styles.filterToggleBtn, filtersOpen && styles.filterToggleBtnActive]}
          onPress={() => setFiltersOpen(v => !v)}
        >
          <MaterialCommunityIcons
            name="filter-variant"
            size={20}
            color={filtersOpen ? '#FFF' : COLORS.primary}
          />
          {activeFiltersCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Collapsible filter panel */}
      {filtersOpen && (
        <View style={styles.filterPanel}>

          {/* Genre */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Genre</Text>
            <View style={styles.chipRow}>
              {GENRE_FILTERS.map(f => renderChip(f, genreFilter === f.value, () => setGenreFilter(f.value)))}
            </View>
          </View>

          {/* Catégorie */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {categoryFilters.map(f => renderChip(f, catFilter === f.value, () => setCatFilter(f.value)))}
            </ScrollView>
          </View>

          {/* Discipline */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Discipline</Text>
            <View style={styles.chipRow}>
              {disciplineFilters.map(f => renderChip(f, discFilter === f.value, () => setDiscFilter(f.value)))}
            </View>
          </View>

          {/* Paiement */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Paiement</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {STATUS_FILTERS.map(f => renderChip(f, payFilter === f.value, () => setPayFilter(f.value)))}
            </ScrollView>
          </View>

          {/* Assurance */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Assurance</Text>
            <View style={styles.chipRow}>
              {ASSURANCE_FILTERS.map(f => renderChip(f, assureFilter === f.value, () => setAssureFilter(f.value)))}
            </View>
          </View>

          {/* Clear all */}
          {activeFiltersCount > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={clearAllFilters}>
              <MaterialCommunityIcons name="filter-remove" size={15} color={COLORS.danger} />
              <Text style={styles.clearBtnText}>Effacer tous les filtres</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Count row */}
      <View style={styles.headerRow}>
        <Text style={styles.countText}>
          {filtered.length} adhérent{filtered.length !== 1 ? 's' : ''}
          {activeFiltersCount > 0 ? ' (filtrés)' : ''}
        </Text>
        <TouchableOpacity
          style={styles.printListBtn}
          onPress={handlePrintList}
          disabled={printing}
          activeOpacity={0.8}
        >
          {printing ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <>
              <MaterialCommunityIcons name="printer" size={16} color={COLORS.primary} />
              <Text style={styles.printListText}>Imprimer</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* List */}
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

// ── Styles ────────────────────────────────────────────────────────────────────
const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingVertical: 10,
  },
  filterToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterCountText: { color: '#FFF', fontSize: 9, fontWeight: '900' },

  // Filter panel
  filterPanel: {
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    paddingBottom: 12,
    gap: 4,
  },
  filterGroup: {
    paddingTop: 6,
  },
  filterGroupLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  filterChipIcon: { fontSize: 13 },
  filterChipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.danger + '15',
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
  },
  clearBtnText: { color: COLORS.danger, fontSize: 12, fontWeight: '700' },

  // Header row
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  printListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  printListText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },

  // List
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
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  genreBadge: { borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  genreBadgeText: { fontSize: 10, fontWeight: '700' },
  payBadge: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  payBadgeText: { fontSize: 11, fontWeight: '700' },
  discipline: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },

  // FAB
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
