// src/screens/admin/AdherentListScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, RefreshControl, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { printHtml } from '../../services/printing';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import CategoryBadge from '../../components/CategoryBadge';
import useTheme, { useResponsive } from '../../theme/useTheme';
import { CATEGORIES, DISCIPLINES, getCategoryByAge, getEffectiveCategory, getThemedCategory, calculateAge } from '../../utils/categories';
import { PAYMENT_STATUS, getStatusColor, getStatusLabel } from '../../utils/payments';
import { formatDate } from '../../utils/seasons';
import { getAdherentPhotoUri } from '../../utils/adherentPhotos';
import { getPaymentStatusByAdherent } from '../../database/database';
import ValidationAssuranceModal from '../../components/ValidationAssuranceModal';
import { printAllAdherentCards } from '../../utils/printAdherentCards';
import { paginateItems } from '../../utils/printAdherentList';

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
  const [sortBy,        setSortBy]        = useState('registration');
  const [sortOrder,     setSortOrder]     = useState('desc');
  const [payStatusMap,  setPayStatusMap]  = useState({});
  const [refreshing,    setRefreshing]    = useState(false);
  const [printing,      setPrinting]      = useState(false);
  const [printingCards, setPrintingCards] = useState(false);
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
    ...CATEGORIES.map(category => {
      const themedCategory = getThemedCategory(category, COLORS);
      return { value: category.label, label: category.label, icon: category.icon, color: themedCategory.color };
    }),
  ], [COLORS]);

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

  const sortedAdherents = useMemo(() => {
    const direction = sortOrder === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = `${a.nom || ''} ${a.prenom || ''}`.trim();
        const nameB = `${b.nom || ''} ${b.prenom || ''}`.trim();
        return nameA.localeCompare(nameB, 'fr', { sensitivity: 'base' }) * direction;
      }

      const dateA = sortBy === 'birthDate'
        ? a.dateNaissance
        : a.dateInscriptionSaison || a.dateInscription || a.createdAt;
      const dateB = sortBy === 'birthDate'
        ? b.dateNaissance
        : b.dateInscriptionSaison || b.dateInscription || b.createdAt;
      const timeA = dateA ? new Date(dateA).getTime() : NaN;
      const timeB = dateB ? new Date(dateB).getTime() : NaN;

      if (!Number.isFinite(timeA)) return Number.isFinite(timeB) ? 1 : 0;
      if (!Number.isFinite(timeB)) return -1;
      return (timeA - timeB) * direction;
    });
  }, [filtered, sortBy, sortOrder]);

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
    if (sortedAdherents.length === 0) {
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

      const pages = paginateItems(sortedAdherents);
      const pagesHtml = pages.map((page, pageIndex) => {
        const rowsHtml = page.map((item, index) => {
          const cat      = getEffectiveCategory(item);
          const st       = payStatusMap[item.id];
          const stLabel  = st ? getStatusLabel(st) : '—';
          const stColor  = st ? getStatusColor(st) : '#888';
          const dateInsc = item.dateInscriptionSaison || item.dateInscription || item.createdAt?.slice(0, 10);
          const rowNumber = pageIndex * 20 + index + 1;
          return `
            <tr>
              <td style="text-align:center;color:#64748B;font-weight:600">${rowNumber}</td>
              <td style="font-family:monospace;font-weight:700">${item.code}</td>
              <td style="font-weight:700">${item.nom.toUpperCase()} ${item.prenom}</td>
              <td>${cat.label}</td>
              <td style="color:#0284C7;font-weight:600">${item.discipline || '—'}</td>
              <td>${formatDate(item.dateNaissance)}</td>
              <td>${dateInsc ? formatDate(dateInsc) : '—'}</td>
              <td>${item.telephone || '—'}</td>
              <td>
                <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;color:${stColor};background:${stColor}18;border:1px solid ${stColor}40">${stLabel}</span>
              </td>
            </tr>`;
        }).join('');

        return `
          <section class="page">
            <div class="header">
              <div><h1>🏆 CMB CLUB — LISTE DES ADHÉRENTS</h1><p>Club Omnisports CMB</p></div>
              <div style="text-align:right">
                <div class="badge">Saison ${saisonText}</div>
                <div>Imprimé le : ${now}</div>
                <div>Total : <strong>${sortedAdherents.length}</strong></div>
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
                <th>Date Naiss.</th><th>Date Inscription</th><th>Téléphone</th><th>Statut</th>
              </tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <div class="footer"><div>CMBClub App v1.0</div><div>Page ${pageIndex + 1} / ${pages.length}</div></div>
          </section>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
          @page{size:A4 landscape;margin:12mm}
          body{font-family:Arial,sans-serif;font-size:11.5px;margin:0;padding:10px}
          .page{break-after:page;page-break-after:always}
          .page:last-child{break-after:auto;page-break-after:auto}
          .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1DD1A1;padding-bottom:8px;margin-bottom:10px}
          h1{margin:0;font-size:22px;font-weight:900}
          .badge{display:inline-block;background:#0A1520;color:#1DD1A1;font-weight:700;padding:3px 10px;border-radius:12px}
          .filters{display:flex;gap:15px;background:#F8FAFC;border:1px solid #E2E8F0;padding:6px 12px;border-radius:8px;margin-bottom:10px}
          table{width:100%;border-collapse:collapse}
          th{background:#0A1520;color:#fff;text-align:left;padding:10px;text-transform:uppercase;letter-spacing:.5px}
          td{padding:5px 8px;border-bottom:1px solid #E2E8F0}
          tr{break-inside:avoid;page-break-inside:avoid}
          .footer{margin-top:10px;display:flex;justify-content:space-between;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:6px}
        </style></head><body>
        ${pagesHtml}
      </body></html>`;

      await printHtml(html);
    } catch (e) {
      Alert.alert("Erreur d'impression", e.message);
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintCards = async () => {
    if (sortedAdherents.length === 0) {
      Alert.alert('Information', 'Aucun adhérent à imprimer avec les filtres actuels.');
      return;
    }
    setPrintingCards(true);
    try {
      await printAllAdherentCards({
        adherents: sortedAdherents,
        saison: saisonActive,
      });
    } catch (e) {
      Alert.alert("Erreur d'impression des cartes", e.message);
    } finally {
      setPrintingCards(false);
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

          {/* Tri */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Trier par</Text>
            <View style={styles.chipRow}>
              {[
                { value: 'registration', label: "Date d'inscription" },
                { value: 'name', label: 'Nom & prénom' },
                { value: 'birthDate', label: 'Date de naissance' },
              ].map(option => renderChip(option, sortBy === option.value, () => setSortBy(option.value)))}
            </View>
            <View style={styles.sortOrderRow}>
              {[
                { value: 'asc', label: 'Croissant', icon: 'sort-ascending' },
                { value: 'desc', label: 'Décroissant', icon: 'sort-descending' },
              ].map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.sortOrderButton, sortOrder === option.value && styles.sortOrderButtonActive]}
                  onPress={() => setSortOrder(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sortOrder === option.value }}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={16}
                    color={sortOrder === option.value ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text style={[styles.sortOrderText, sortOrder === option.value && styles.sortOrderTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
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
          {sortedAdherents.length} adhérent{sortedAdherents.length !== 1 ? 's' : ''}
          {activeFiltersCount > 0 ? ' (filtrés)' : ''}
        </Text>

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Bouton validation assurances */}
          <TouchableOpacity
            style={styles.assurancesBtn}
            onPress={() => setShowAssuranceModal(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="shield-check" size={15} color={COLORS.success} />
            <Text style={styles.assurancesBtnText}>Assurances</Text>
          </TouchableOpacity>

          {/* Bouton impression Cartes */}
          <TouchableOpacity
            style={styles.cardsBtn}
            onPress={handlePrintCards}
            disabled={printingCards}
            activeOpacity={0.8}
          >
            {printingCards ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <MaterialCommunityIcons name="badge-account-horizontal-outline" size={15} color={COLORS.primary} />
                <Text style={styles.cardsBtnText}>Cartes ({sortedAdherents.length})</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Bouton impression liste */}
          <TouchableOpacity
            style={styles.printBtn}
            onPress={handlePrintList}
            disabled={printing}
            activeOpacity={0.8}
          >
            {printing ? (
              <ActivityIndicator size="small" color={COLORS.primaryLight} />
            ) : (
              <>
                <MaterialCommunityIcons name="printer" size={15} color={COLORS.primaryLight} />
                <Text style={styles.printBtnText}>Liste</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={sortedAdherents}
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

// ── Helper icône discipline ──────────────────────────────────────────────────
const getDisciplineIcon = (discipline) => {
  if (!discipline) return '🏅';
  const lower = discipline.toLowerCase();
  if (lower.includes('kick') || lower.includes('box')) return '🥊';
  if (lower.includes('nat') || lower.includes('swim')) return '🏊';
  if (lower.includes('judo') || lower.includes('karat') || lower.includes('art') || lower.includes('lutte')) return '🥋';
  if (lower.includes('foot') || lower.includes('ball')) return '⚽';
  if (lower.includes('gym') || lower.includes('fit') || lower.includes('muscu')) return '🏋️';
  if (lower.includes('run') || lower.includes('athle')) return '🏃';
  return '🏅';
};

// ── Composant Avatar Adhérent mémoïsé ────────────────────────────────────────
const AdherentAvatar = React.memo(function AdherentAvatar({ photo, catIcon, styles }) {
  const [imgError, setImgError] = useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [photo]);

  if (photo && !imgError) {
    return (
      <View style={styles.avatar}>
        <Image
          source={{ uri: getAdherentPhotoUri(photo) }}
          style={styles.photo}
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  return (
    <View style={styles.avatar}>
      <View style={styles.photoPlaceholder}>
        <Text style={styles.photoEmoji}>{catIcon || '👤'}</Text>
      </View>
    </View>
  );
});

// ── Composant Carte Adhérent mémoïsé ─────────────────────────────────────────
const AdherentCardItem = React.memo(function AdherentCardItem({ item, payStatus, COLORS, styles, onPress }) {
  const cat = getThemedCategory(getEffectiveCategory(item), COLORS);
  const isFemme = item.genre === 'F';
  const catColor = cat?.color || COLORS.primaryLight;
  const payColor = payStatus ? getStatusColor(payStatus) : null;
  const payLabel = payStatus ? getStatusLabel(payStatus) : null;
  const dateInsc = item.dateInscriptionSaison || item.dateInscription || item.createdAt?.slice(0, 10);
  const age = item.dateNaissance ? calculateAge(item.dateNaissance) : null;
  const discIcon = getDisciplineIcon(item.discipline);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Avatar / Photo / Emoji */}
      <AdherentAvatar photo={item.photo} catIcon={cat?.icon} styles={styles} />

      {/* Content */}
      <View style={styles.info}>
        {/* Ligne 1 : Nom complet (NOM Prénom) + Code */}
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.nom ? item.nom.toUpperCase() : ''} {item.prenom || ''}
          </Text>
          {item.code ? (
            <View style={styles.codeBadge}>
              <Text style={styles.codeText} numberOfLines={1} ellipsizeMode="middle">
                {item.code}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Ligne 2 : Badges uniformisés (Catégorie, Genre, Assurance, Paiement) */}
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
              <Text style={styles.nonAssureText}>❌ Non assuré</Text>
            </View>
          )}

          {/* Paiement */}
          {payLabel && payColor && (
            <View style={[styles.payBadge, { backgroundColor: payColor + '18', borderColor: payColor + '50' }]}>
              <Text style={[styles.payText, { color: payColor }]}>{payLabel}</Text>
            </View>
          )}
        </View>

        {/* Ligne 3 : Discipline & Métadonnées (Âge/naissance, inscription) */}
        <View style={styles.metaRow}>
          <View style={styles.disciplineTag}>
            <Text style={styles.disciplineIcon}>{discIcon}</Text>
            <Text style={styles.disciplineText}>{item.discipline || 'Non assignée'}</Text>
          </View>

          {age !== null && (
            <Text style={styles.metaItem}>
              🎂 {age} ans
            </Text>
          )}

          {dateInsc ? (
            <Text style={styles.metaItem}>
              📅 Inscrit: {formatDate(dateInsc)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Chevron droit */}
      <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.textMuted} style={styles.chevron} />
    </TouchableOpacity>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const createStyles = (COLORS, RADIUS, SHADOWS, isSmall, isLarge, horizontalPadding) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
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
    backgroundColor: COLORS.bgInput,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterToggleBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.primary,
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
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  filterGroup: {
    paddingTop: 6,
  },
  filterGroupLabel: {
    color: COLORS.textSecondary,
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
  sortOrderRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sortOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortOrderButtonActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  sortOrderText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  sortOrderTextActive: { color: COLORS.primary, fontWeight: '700' },
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
    backgroundColor: COLORS.danger + '18',
    borderWidth: 1,
    borderColor: COLORS.danger + '50',
  },
  clearBtnText: { color: COLORS.danger, fontSize: 12, fontWeight: '700' },

  // Header row
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  assurancesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.success + '18',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.success,
  },
  assurancesBtnText: { color: COLORS.success, fontWeight: '700', fontSize: 12.5 },
  cardsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary + '18',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  cardsBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 12.5 },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight + '18',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
  },
  printBtnText: { color: COLORS.primaryLight, fontWeight: '700', fontSize: 12.5 },

  // List
  list: { paddingBottom: 100, paddingTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: { width: 54, height: 54, marginRight: 12, borderRadius: 27, overflow: 'hidden', backgroundColor: COLORS.bgInput },
  photo: { width: '100%', height: '100%', borderRadius: 27, resizeMode: 'cover' },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 27,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    flexShrink: 1,
  },
  codeBadge: {
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    maxWidth: 130,
  },
  codeText: {
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.primary + '20',
    borderWidth: 1,
    borderColor: COLORS.primary + '60',
  },
  genreTextM: {
    color: COLORS.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
  genreBadgeF: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: COLORS.secondary + '20',
    borderWidth: 1,
    borderColor: COLORS.secondary + '60',
  },
  genreTextF: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  assureBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: COLORS.success + '20',
    borderWidth: 1,
    borderColor: COLORS.success + '60',
  },
  assureText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '700',
  },
  nonAssureBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: COLORS.danger + '20',
    borderWidth: 1,
    borderColor: COLORS.danger + '60',
  },
  nonAssureText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  payBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  payText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  disciplineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary + '18',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '50',
  },
  disciplineIcon: {
    fontSize: 11,
  },
  disciplineText: {
    color: COLORS.primaryLight,
    fontSize: 11.5,
    fontWeight: '700',
  },
  metaItem: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
  },
  chevron: {
    marginLeft: 6,
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: COLORS.primary,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabDisabled: {
    backgroundColor: COLORS.bgInput,
    opacity: 0.5,
  },
});
