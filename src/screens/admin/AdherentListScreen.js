// src/screens/admin/AdherentListScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import * as Print from 'expo-print';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import FilterBar from '../../components/FilterBar';
import CategoryBadge from '../../components/CategoryBadge';
import { COLORS, RADIUS, SHADOWS } from '../../theme/colors';
import { CATEGORIES, DISCIPLINES, getCategoryByAge } from '../../utils/categories';
import { PAYMENT_STATUS, getStatusColor, getStatusLabel } from '../../utils/payments';
import { formatDate } from '../../utils/seasons';
import { getPaymentStatusByAdherent } from '../../database/database';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous', icon: '👥' },
  { value: PAYMENT_STATUS.PAYE, label: 'À jour', icon: '✅', color: COLORS.success },
  { value: PAYMENT_STATUS.EN_RETARD, label: 'En retard', icon: '⚠️', color: COLORS.danger },
  { value: PAYMENT_STATUS.A_PAYER, label: 'À payer', icon: '🕐', color: COLORS.warning },
];

export default function AdherentListScreen({ navigation }) {
  const { adherents, loadAdherents, saisonActive, loadSaisons, disciplines, loadDisciplines } = useStore();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [discFilter, setDiscFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [payStatusMap, setPayStatusMap] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);

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

  const categoryFilters = useMemo(() => [
    { value: 'all', label: 'Toutes', icon: '📊' },
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

  const handlePrintList = async () => {
    if (filtered.length === 0) {
      Alert.alert('Information', 'Aucun adhérent à imprimer avec les filtres actuels.');
      return;
    }
    setPrinting(true);
    try {
      const now = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const saisonText = saisonActive ? saisonActive.label : 'N/A';
      const catText = catFilter === 'all' ? 'Toutes' : catFilter;
      const discText = discFilter === 'all' ? 'Toutes' : discFilter;
      const payText = payFilter === 'all' ? 'Tous' : getStatusLabel(payFilter);

      const rowsHtml = filtered.map((item, index) => {
        const cat = getCategoryByAge(item.dateNaissance);
        const st = payStatusMap[item.id];
        const stLabel = st ? getStatusLabel(st) : '—';
        const stColor = st ? getStatusColor(st) : '#888';
        const birthDate = formatDate(item.dateNaissance);

        return `
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 8px 10px; text-align: center; font-weight: 600; color: #64748B;">${index + 1}</td>
            <td style="padding: 8px 10px; font-family: monospace; font-weight: 700; color: #0F172A;">${item.code}</td>
            <td style="padding: 8px 10px; font-weight: 700; color: #0F172A;">${item.nom.toUpperCase()} ${item.prenom}</td>
            <td style="padding: 8px 10px; color: #334155;">${cat.label}</td>
            <td style="padding: 8px 10px; font-weight: 600; color: #0284C7;">${item.discipline || '—'}</td>
            <td style="padding: 8px 10px; color: #475569;">${birthDate}</td>
            <td style="padding: 8px 10px; color: #475569;">${item.telephone || '—'}</td>
            <td style="padding: 8px 10px;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; color: ${stColor}; background-color: ${stColor}18; border: 1px solid ${stColor}40;">
                ${stLabel}
              </span>
            </td>
          </tr>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Liste des Adhérents - CMB CLUB</title>
            <style>
              @page { size: A4 landscape; margin: 12mm; }
              body { font-family: 'Segoe UI', Arial, sans-serif; background: #ffffff; color: #0F172A; margin: 0; padding: 10px; }
              .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1DD1A1; padding-bottom: 12px; margin-bottom: 15px; }
              .title-box h1 { margin: 0; font-size: 22px; font-weight: 900; color: #0A1520; letter-spacing: 1px; }
              .title-box p { margin: 3px 0 0 0; font-size: 12px; color: #64748B; }
              .meta-box { text-align: right; font-size: 11px; color: #475569; }
              .meta-badge { display: inline-block; background: #0A1520; color: #1DD1A1; font-weight: 700; padding: 3px 10px; border-radius: 12px; margin-bottom: 4px; }
              .filter-bar { display: flex; gap: 15px; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 8px 14px; border-radius: 8px; font-size: 11.5px; margin-bottom: 15px; }
              .filter-item { font-weight: 600; color: #334155; }
              .filter-item span { color: #0F172A; font-weight: 700; }
              table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
              th { background: #0A1520; color: #FFFFFF; text-align: left; padding: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
              th:first-child { border-top-left-radius: 6px; }
              th:last-child { border-top-right-radius: 6px; }
              .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 8px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title-box">
                <h1>🏆 CMB CLUB - LISTE DES ADHÉRENTS</h1>
                <p>Club Omnisports CMB</p>
              </div>
              <div class="meta-box">
                <div class="meta-badge">Saison ${saisonText}</div>
                <div>Imprimé le : ${now}</div>
                <div>Total adhérents : <strong>${filtered.length}</strong></div>
              </div>
            </div>

            <div class="filter-bar">
              <div class="filter-item">Catégorie : <span>${catText}</span></div>
              <div class="filter-item">Discipline : <span>${discText}</span></div>
              <div class="filter-item">Statut paiement : <span>${payText}</span></div>
              ${search ? `<div class="filter-item">Recherche : <span>"${search}"</span></div>` : ''}
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 30px; text-align: center;">#</th>
                  <th style="width: 90px;">Code</th>
                  <th>Nom & Prénom</th>
                  <th>Catégorie</th>
                  <th>Discipline</th>
                  <th>Date Naiss.</th>
                  <th>Téléphone</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            <div class="footer">
              <div>CMBClub App v1.0.0 — Document officiel</div>
              <div>Page 1 sur 1</div>
            </div>
          </body>
        </html>
      `;

      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Erreur d\'impression', e.message);
    } finally {
      setPrinting(false);
    }
  };

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

      <View style={styles.headerRow}>
        <Text style={styles.countText}>{filtered.length} adhérent{filtered.length > 1 ? 's' : ''}</Text>
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
              <Text style={styles.printListText}>Imprimer la liste</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
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
  printListText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
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
