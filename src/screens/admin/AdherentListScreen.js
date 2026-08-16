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
import useTheme, { useResponsive } from '../../theme/useTheme';
import { CATEGORIES, DISCIPLINES, getCategoryByAge, getEffectiveCategory } from '../../utils/categories';
import { PAYMENT_STATUS, getStatusColor, getStatusLabel } from '../../utils/payments';
import { formatDate } from '../../utils/seasons';
import { getPaymentStatusByAdherent } from '../../database/database';
import ValidationAssuranceModal from '../../components/ValidationAssuranceModal';

export default function AdherentListScreen({ navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const { isSmall, isTablet, isDesktop, horizontalPadding } = useResponsive();
  const isLarge = isTablet || isDesktop;
  const styles = useMemo(
    () => createStyles(COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding),
    [COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding],
  );

  const STATUS_FILTERS = useMemo(() => [
    { value: 'all',                       label: 'Tous',       icon: '👥' },
    { value: PAYMENT_STATUS.PAYE,         label: 'À jour',     icon: '✅', color: COLORS.success },
    { value: PAYMENT_STATUS.AVANCE,       label: 'Partiel',    icon: '🔵', color: COLORS.info },
    { value: PAYMENT_STATUS.EN_RETARD,    label: 'En retard',  icon: '⚠️', color: COLORS.danger },
    { value: PAYMENT_STATUS.A_PAYER,      label: 'Non payé',   icon: '🕐', color: COLORS.warning },
  ], [COLORS]);

  const { adherents, loadAdherents, saisonActive, loadSaisons, disciplines, loadDisciplines } = useStore();

  const [search,        setSearch]        = useState('');
  const [catFilter,     setCatFilter]     = useState('all');
  const [discFilter,    setDiscFilter]    = useState('all');
  const [payFilter,     setPayFilter]     = useState('all');
  const [genreFilter,   setGenreFilter]   = useState('all');
  const [assureFilter,  setAssureFilter]  = useState('all');
  const [enrollFilter,  setEnrollFilter]  = useState('all');
  const [payStatusMap,  setPayStatusMap]  = useState({});
  const [refreshing,    setRefreshing]    = useState(false);
  const [printing,      setPrinting]      = useState(false);
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [showAssuranceModal, setShowAssuranceModal] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    await loadSaisons();
    const saison = useStore.getState().saisonActive;
    await loadAdherents(saison?.id);
    await loadDisciplines();
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

  const ENROLLMENT_FILTERS = [
    { value: 'all',          label: 'Tous',           icon: '👥' },
    { value: 'enrolled',     label: 'Inscrits',       icon: '✅', color: COLORS.success },
    { value: 'not_enrolled', label: 'À réinscrire ⚠️', icon: '⚠️', color: COLORS.warning },
  ];

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return adherents.filter(a => {
      const cat      = getEffectiveCategory(a);
      const fullName = `${a.nom} ${a.prenom} ${a.code}`.toLowerCase();
      if (search && !fullName.includes(search.toLowerCase())) return false;
      if (catFilter   !== 'all' && cat.label    !== catFilter)   return false;
      if (discFilter  !== 'all' && a.discipline !== discFilter)   return false;
      if (genreFilter !== 'all' && a.genre      !== genreFilter)  return false;
      if (assureFilter === 'assure' && !a.assure) return false;
      if (assureFilter === 'non_assure' && a.assure) return false;
      if (enrollFilter === 'enrolled' && a.isEnrolled === 0) return false;
      if (enrollFilter === 'not_enrolled' && a.isEnrolled !== 0) return false;
      if (payFilter   !== 'all') {
        if (payStatusMap[a.id] !== payFilter) return false;
      }
      return true;
    });
  }, [adherents, search, catFilter, discFilter, payFilter, genreFilter, assureFilter, enrollFilter, payStatusMap]);

  const activeFiltersCount = [catFilter, discFilter, payFilter, genreFilter, assureFilter, enrollFilter]
    .filter(f => f !== 'all').length + (search ? 1 : 0);

  const clearAllFilters = () => {
    setCatFilter('all');
    setDiscFilter('all');
    setPayFilter('all');
    setGenreFilter('all');
    setAssureFilter('all');
    setEnrollFilter('all');
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
        const cat     = getEffectiveCategory(item);
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
  const renderItem = useCallback(({ item }) => {
    const payStatus = payStatusMap[item.id];
    return (
      <AdherentCardItem
        item={item}
        payStatus={payStatus}
        COLORS={COLORS}
        styles={styles}
        onPress={() => navigation.navigate('AdherentDetail', { adherentId: item.id })}
      />
    );
  }, [payStatusMap, COLORS, styles, navigation]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.innerWrapper}>

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

          {/* Inscription saison */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Inscription {saisonActive ? `(${saisonActive.label})` : ''}</Text>
            <View style={styles.chipRow}>
              {ENROLLMENT_FILTERS.map(f => renderChip(f, enrollFilter === f.value, () => setEnrollFilter(f.value)))}
            </View>
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

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {/* Bouton validation assurances */}
          <TouchableOpacity
            style={styles.assurancesBtn}
            onPress={() => setShowAssuranceModal(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="shield-check" size={16} color="#10B981" />
            <Text style={styles.assurancesBtnText}>Assurances</Text>
          </TouchableOpacity>

          {/* Bouton impression */}
          <TouchableOpacity
            style={styles.printBtn}
            onPress={handlePrintList}
            disabled={printing}
            activeOpacity={0.8}
          >
            {printing ? (
              <ActivityIndicator size="small" color="#38BDF8" />
            ) : (
              <>
                <MaterialCommunityIcons name="printer" size={16} color="#38BDF8" />
                <Text style={styles.printBtnText}>Imprimer</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="account-search" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucun adhérent trouvé</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, !saisonActive && styles.fabDisabled]}
        onPress={() => {
          if (!saisonActive) {
            Alert.alert(
              '⛔ Impossible de créer un adhérent',
              'Veuillez d\'abord créer et activer une saison sportive avant d\'ajouter des adhérents.',
              [{ text: 'OK', style: 'default' }]
            );
            return;
          }
          navigation.navigate('AdherentForm');
        }}
        activeOpacity={saisonActive ? 0.85 : 0.5}
        disabled={!saisonActive}
      >
        <MaterialCommunityIcons name="account-plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Modal Validation Assurances */}
      <ValidationAssuranceModal
        visible={showAssuranceModal}
        onClose={() => setShowAssuranceModal(false)}
      />
      </View>
    </View>
  );
}

// ── Composant Carte Adhérent mémoïsé ─────────────────────────────────────────
const AdherentCardItem = React.memo(function AdherentCardItem({ item, payStatus, COLORS, styles, onPress }) {
  const cat = getEffectiveCategory(item);
  const isFemme = item.genre === 'F';
  const catColor = cat?.color || '#38BDF8';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Avatar / Photo / Emoji */}
      <View style={styles.avatar}>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoEmoji}>{cat?.icon || '👤'}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.info}>
        {/* Ligne 1 : Nom complet + Code */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.prenom} {item.nom ? item.nom.toUpperCase() : ''}
          </Text>
          {item.code ? (
            <View style={styles.codeBadge}>
              <Text style={styles.codeText} numberOfLines={1} ellipsizeMode="middle">
                {item.code}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Ligne 2 : Badges (Catégorie, Genre, Assurance) */}
        <View style={styles.badgesRow}>
          {/* Catégorie */}
          {cat && (
            <View style={[styles.catBadge, { borderColor: catColor + '70', backgroundColor: catColor + '18' }]}>
              <Text style={styles.catIcon}>{cat.icon}</Text>
              <Text style={[styles.catText, { color: catColor }]}>{cat.label}</Text>
            </View>
          )}

          {/* Genre */}
          {isFemme ? (
            <View style={styles.genreBadgeF}>
              <Text style={styles.genreTextF}>♀ Féminin</Text>
            </View>
          ) : (
            <View style={styles.genreBadgeM}>
              <Text style={styles.genreTextM}>♂ Masculin</Text>
            </View>
          )}

          {/* Assurance */}
          {item.assure ? (
            <View style={styles.assureBadge}>
              <Text style={styles.assureText}>🛡️ Assuré</Text>
            </View>
          ) : (
            <View style={styles.nonAssureBadge}>
              <Text style={styles.nonAssureText}>Non assuré</Text>
            </View>
          )}
        </View>

        {/* Ligne 3 : Discipline */}
        <View style={styles.disciplineRow}>
          <Text style={styles.disciplineIcon}>🥊</Text>
          <Text style={styles.disciplineText}>{item.discipline || 'Natation'}</Text>
        </View>
      </View>

      {/* Chevron droit */}
      <MaterialCommunityIcons name="chevron-right" size={22} color="#475569" style={styles.chevron} />
    </TouchableOpacity>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const createStyles = (COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg || '#0B1320' },
  innerWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: horizontalPadding || 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#132032',
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 10,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    paddingVertical: 0,
  },
  filterToggleBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#132032',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  filterCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.danger || '#EF4444',
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
    backgroundColor: '#132032',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingBottom: 12,
    gap: 4,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  filterGroup: {
    paddingTop: 6,
  },
  filterGroupLabel: {
    color: '#94A3B8',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.2)',
    borderColor: '#0EA5E9',
  },
  filterChipIcon: { fontSize: 13 },
  filterChipText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#38BDF8', fontWeight: '700' },
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
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  clearBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  // Header row
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countText: { color: '#94A3B8', fontSize: 14, fontWeight: '700' },
  assurancesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  assurancesBtnText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0284C7',
  },
  printBtnText: { color: '#38BDF8', fontWeight: '700', fontSize: 13 },

  // List
  list: { paddingBottom: 100, paddingTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#132032',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  avatar: { width: 54, height: 54, marginRight: 12 },
  photo: { width: 54, height: 54, borderRadius: 27, resizeMode: 'cover' },
  photoPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1A2A3E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: {
    fontSize: 24,
  },
  info: { flex: 1, justifyContent: 'center' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 16,
    flexShrink: 1,
  },
  codeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    maxWidth: 130,
  },
  codeText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  catIcon: { fontSize: 11 },
  catText: { fontSize: 11, fontWeight: '700' },
  genreBadgeM: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.35)',
  },
  genreTextM: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  genreBadgeF: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.35)',
  },
  genreTextF: {
    color: '#F472B6',
    fontSize: 11,
    fontWeight: '700',
  },
  assureBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  assureText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  nonAssureBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.35)',
  },
  nonAssureText: {
    color: '#FB923C',
    fontSize: 11,
    fontWeight: '700',
  },
  disciplineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  disciplineIcon: {
    fontSize: 12,
  },
  disciplineText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  chevron: {
    marginLeft: 6,
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#64748B', fontSize: 15 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#00A3FF',
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00A3FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabDisabled: {
    backgroundColor: '#475569',
    opacity: 0.5,
  },
});

