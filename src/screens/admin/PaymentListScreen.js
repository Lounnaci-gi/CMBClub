// src/screens/admin/PaymentListScreen.js
// Vue globale des paiements avec filtres avancés (Statut, Discipline, Catégorie) et impression PDF
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert, Image, Modal, Pressable, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import useStore from '../../store/useStore';
import PaymentCard from '../../components/PaymentCard';
import FilterBar from '../../components/FilterBar';
import useTheme from '../../theme/useTheme';
import { getAllPaiementsBySaison, refreshPaymentStatuses } from '../../database/database';
import { PAYMENT_STATUS, getStatusLabel } from '../../utils/payments';
import { CATEGORIES, getCategoryByAge, DISCIPLINES } from '../../utils/categories';

export default function PaymentListScreen({ navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const STATUS_FILTERS = useMemo(() => [
    { value: 'all', label: 'Tous', icon: '📋' },
    { value: PAYMENT_STATUS.PAYE, label: 'Payés', icon: '✅', color: COLORS.success },
    { value: PAYMENT_STATUS.AVANCE, label: 'Partiel', icon: '🔵', color: COLORS.info },
    { value: PAYMENT_STATUS.EN_RETARD, label: 'En retard', icon: '⚠️', color: COLORS.danger },
    { value: PAYMENT_STATUS.A_PAYER, label: 'Non Payé', icon: '🕐', color: COLORS.warning },
  ], [COLORS]);

  const { saisonActive, saisons, loadSaisons, disciplines, loadDisciplines } = useStore();
  const [paiements, setPaiements] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [disciplineFilter, setDisciplineFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedSaisonId, setSelectedSaisonId] = useState(null);

  useEffect(() => {
    loadDisciplines();
  }, [loadDisciplines]);

  const activeDisciplines = useMemo(() => {
    if (disciplines && disciplines.length > 0) {
      return disciplines.map(d => d.nom);
    }
    return DISCIPLINES;
  }, [disciplines]);

  const saison = useMemo(() => {
    if (selectedSaisonId) return saisons.find(s => s.id === selectedSaisonId) || saisonActive;
    return saisonActive;
  }, [selectedSaisonId, saisons, saisonActive]);

  const load = useCallback(async () => {
    await loadSaisons();
    const s = selectedSaisonId
      ? useStore.getState().saisons.find(x => x.id === selectedSaisonId)
      : useStore.getState().saisonActive;
    if (s) {
      await refreshPaymentStatuses(s.id);
      const p = await getAllPaiementsBySaison(s.id);
      setPaiements(p);
    }
  }, [selectedSaisonId, loadSaisons]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Calcul dynamique de la catégorie pour chaque paiement
  const paiementsWithCategory = useMemo(() => {
    return paiements.map(p => {
      const category = p.dateNaissance ? getCategoryByAge(p.dateNaissance) : { label: 'Non spécifié' };
      return {
        ...p,
        categoryLabel: category.label,
      };
    });
  }, [paiements]);

  // Filtrage combiné (Statut + Discipline + Catégorie) avec tolérance majuscules/espaces
  const filtered = useMemo(() => {
    return paiementsWithCategory.filter(p => {
      const matchStatus = statusFilter === 'all' || p.statut === statusFilter;

      const pDisc = (p.discipline || '').trim().toLowerCase();
      const fDisc = disciplineFilter.trim().toLowerCase();
      const matchDiscipline = disciplineFilter === 'all' || pDisc === fDisc;

      const pCat = (p.categoryLabel || '').trim().toLowerCase();
      const fCat = categoryFilter.trim().toLowerCase();
      const matchCategory = categoryFilter === 'all' || pCat === fCat;

      return matchStatus && matchDiscipline && matchCategory;
    });
  }, [paiementsWithCategory, statusFilter, disciplineFilter, categoryFilter]);

  const counts = useMemo(() => ({
    all: paiements.length,
    [PAYMENT_STATUS.PAYE]: paiements.filter(p => p.statut === PAYMENT_STATUS.PAYE).length,
    [PAYMENT_STATUS.AVANCE]: paiements.filter(p => p.statut === PAYMENT_STATUS.AVANCE).length,
    [PAYMENT_STATUS.EN_RETARD]: paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD).length,
    [PAYMENT_STATUS.A_PAYER]: paiements.filter(p => p.statut === PAYMENT_STATUS.A_PAYER).length,
  }), [paiements]);

  const totalCollected = useMemo(() =>
    filtered.filter(p => p.statut === PAYMENT_STATUS.PAYE).reduce((s, p) => s + (p.montantPaye || 0), 0),
    [filtered]
  );
  const totalRetard = useMemo(() =>
    filtered.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD).reduce((s, p) => s + (p.montantDu - (p.remiseMontant || 0) - (p.montantPaye || 0)), 0),
    [filtered]
  );

  // Totaux des colonnes sur la liste filtrée
  const totals = useMemo(() => {
    const totalDu = filtered.reduce((s, p) => s + (p.montantDu || 0), 0);
    const totalVerse = filtered.reduce((s, p) => s + (p.montantPaye || 0), 0);
    const totalRemise = filtered.reduce((s, p) => s + (p.remiseMontant || 0), 0);
    const totalReste = filtered.reduce((s, p) => {
      const net = (p.montantDu || 0) - (p.remiseMontant || 0);
      return s + Math.max(0, net - (p.montantPaye || 0));
    }, 0);
    return { totalDu, totalVerse, totalRemise, totalReste };
  }, [filtered]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (disciplineFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    return count;
  }, [disciplineFilter, categoryFilter]);

  const resetSubFilters = () => {
    setDisciplineFilter('all');
    setCategoryFilter('all');
  };

  // Impresson de la liste filtrée
  const handlePrint = async () => {
    if (filtered.length === 0) {
      Alert.alert('Information', 'Aucun paiement à imprimer pour les filtres sélectionnés.');
      return;
    }

    setPrinting(true);
    try {
      let logoUri = '';
      try {
        logoUri = Image.resolveAssetSource(require('../../../assets/cmbclub.png')).uri;
      } catch (_e) {
        logoUri = '';
      }

      const statusFilterLabel = STATUS_FILTERS.find(f => f.value === statusFilter)?.label || 'Tous';
      const nowStr = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });

      const rowsHtml = filtered.map((p, index) => {
        const netDu = (p.montantDu || 0) - (p.remiseMontant || 0);
        const reste = Math.max(0, netDu - (p.montantPaye || 0));

        let statusColor = '#3B82F6';
        let statusBadgeText = getStatusLabel(p.statut);
        if (p.statut === PAYMENT_STATUS.PAYE) statusColor = '#10B981';
        if (p.statut === PAYMENT_STATUS.EN_RETARD) statusColor = '#EF4444';

        return `
          <tr style="${index % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 11px; font-weight: bold;">${p.code || '-'}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${p.nom || ''} ${p.prenom || ''}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${p.discipline || '-'}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${p.categoryLabel || '-'}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${p.label || '-'}</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${(p.montantDu || 0).toLocaleString()} DA</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #059669; font-weight: 600;">${(p.montantPaye || 0).toLocaleString()} DA</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: ${reste > 0 ? '#dc2626' : '#64748b'};">${reste.toLocaleString()} DA</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
              <span style="background-color: ${statusColor}15; color: ${statusColor}; padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 1px solid ${statusColor}40;">
                ${statusBadgeText}
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
            <title>Rapport de Paiements - ${saison?.label || ''}</title>
            <style>
              @page { size: A4 landscape; margin: 12mm; }
              body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 12px; }
              .header { display: flex; align-items: center; justify-space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
              .brand { display: flex; align-items: center; gap: 12px; }
              .brand img { width: 48px; height: 48px; border-radius: 24px; }
              .title-box h1 { margin: 0; font-size: 20px; color: #0f172a; font-weight: 800; }
              .title-box p { margin: 2px 0 0 0; color: #64748b; font-size: 11px; }
              .meta-box { text-align: right; font-size: 11px; color: #475569; }
              .filter-tags { display: flex; gap: 12px; background-color: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 11px; }
              .filter-tag { font-weight: 600; color: #1e293b; }
              .stats-summary { display: flex; gap: 20px; margin-bottom: 16px; }
              .stat-card { flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
              .stat-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; }
              .stat-value { font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px; }
              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th { background-color: #0f172a; color: #ffffff; text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 700; }
              .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="brand">
                ${logoUri ? `<img src="${logoUri}" />` : ''}
                <div class="title-box">
                  <h1>CMBClub - Rapport des Paiements</h1>
                  <p>Saison : <strong>${saison?.label || 'Toutes'}</strong></p>
                </div>
              </div>
              <div class="meta-box">
                <div>Edité le : <strong>${nowStr}</strong></div>
                <div>Lignes : <strong>${filtered.length}</strong></div>
              </div>
            </div>

            <div class="filter-tags">
              <div class="filter-tag">📌 Statut : <span>${statusFilterLabel}</span></div>
              <div class="filter-tag">🥋 Discipline : <span>${disciplineFilter === 'all' ? 'Toutes' : disciplineFilter}</span></div>
              <div class="filter-tag">🏷️ Catégorie : <span>${categoryFilter === 'all' ? 'Toutes' : categoryFilter}</span></div>
            </div>

            <div class="stats-summary">
              <div class="stat-card">
                <div class="stat-label">Nombre de paiements</div>
                <div class="stat-value">${filtered.length}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Encaissé</div>
                <div class="stat-value" style="color: #059669;">${totalCollected.toLocaleString()} DA</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total en Retard</div>
                <div class="stat-value" style="color: #dc2626;">${totalRetard.toLocaleString()} DA</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Adhérent</th>
                  <th>Discipline</th>
                  <th>Catégorie</th>
                  <th>Libellé</th>
                  <th style="text-align: right;">Montant Dû</th>
                  <th style="text-align: right;">Versé</th>
                  <th style="text-align: right;">Reste</th>
                  <th style="text-align: center;">Statut</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            <div class="footer">CMBClub - Document officiel généré automatiquement</div>
          </body>
        </html>
      `;

      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d\'imprimer le document.');
    } finally {
      setPrinting(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {saison && (
        <View style={styles.banner}>
          <View style={styles.bannerHeader}>
            <View style={styles.bannerLeft}>
              <MaterialCommunityIcons name="calendar-check" size={20} color={COLORS.secondary} />
              <Text style={styles.bannerTitle}>{saison.label}</Text>
            </View>
            <TouchableOpacity
              style={styles.printBtn}
              onPress={handlePrint}
              disabled={printing}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="printer" size={18} color="#ffffff" />
              <Text style={styles.printBtnText}>{printing ? 'Impression…' : 'Imprimer'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bannerAmts}>
            <View style={styles.bannerAmt}>
              <Text style={styles.bannerAmtValue}>{totalCollected.toLocaleString()}</Text>
              <Text style={styles.bannerAmtLabel}>Encaissé (DA)</Text>
            </View>
            <View style={styles.bannerAmt}>
              <Text style={[styles.bannerAmtValue, { color: COLORS.danger }]}>{totalRetard.toLocaleString()}</Text>
              <Text style={styles.bannerAmtLabel}>Retard (DA)</Text>
            </View>
          </View>
        </View>
      )}

      {saisons.length > 1 && (
        <View style={styles.filterSection}>
          <Text style={styles.filterSectionTitle}>Saison</Text>
          <FilterBar
            filters={saisons.map(s => ({
              value: s.id,
              label: s.label,
              color: s.id === (saison?.id) ? COLORS.secondary : undefined,
            }))}
            activeFilter={saison?.id}
            onSelect={setSelectedSaisonId}
          />
        </View>
      )}

      <View style={styles.filterSection}>
        <Text style={styles.filterSectionTitle}>Statut</Text>
        <FilterBar
          filters={STATUS_FILTERS.map(f => ({ ...f, count: counts[f.value] }))}
          activeFilter={statusFilter}
          onSelect={setStatusFilter}
        />
      </View>

      {/* Barre de filtres complémentaires (Discipline & Catégorie) */}
      <View style={styles.subFilterBarContainer}>
        <TouchableOpacity
          style={[styles.filterTriggerBtn, activeFiltersCount > 0 && styles.filterTriggerBtnActive]}
          onPress={() => setShowFilterModal(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="tune"
            size={18}
            color={activeFiltersCount > 0 ? COLORS.primary : COLORS.textSecondary}
          />
          <Text style={[styles.filterTriggerText, activeFiltersCount > 0 && { color: COLORS.primary, fontWeight: '700' }]}>
            Filtres avancés {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {activeFiltersCount > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={resetSubFilters} activeOpacity={0.7}>
            <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.danger} />
            <Text style={styles.resetBtnText}>Effacer</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Badges des filtres sous-jacents actifs */}
      {activeFiltersCount > 0 && (
        <View style={styles.activeBadgesRow}>
          {disciplineFilter !== 'all' && (
            <TouchableOpacity
              style={styles.activeBadge}
              onPress={() => setDisciplineFilter('all')}
            >
              <Text style={styles.activeBadgeText}>🥋 {disciplineFilter}</Text>
              <MaterialCommunityIcons name="close" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}
          {categoryFilter !== 'all' && (
            <TouchableOpacity
              style={styles.activeBadge}
              onPress={() => setCategoryFilter('all')}
            >
              <Text style={styles.activeBadgeText}>🏆 {categoryFilter}</Text>
              <MaterialCommunityIcons name="close" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.countText}>
        {filtered.length} paiement{filtered.length > 1 ? 's' : ''} trouvé{filtered.length > 1 ? 's' : ''}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PaymentCard
            paiement={item}
            showAdherent
            onPress={() => navigation.navigate('PaymentDetail', { adherentId: item.adherentId })}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={
          filtered.length > 0 ? (
            <View style={styles.totalsFooter}>
              <View style={styles.totalsRow}>
                <View style={styles.totalsCol}>
                  <Text style={styles.totalsLabel}>Montant dû</Text>
                  <Text style={styles.totalsValue}>{totals.totalDu.toLocaleString()} DA</Text>
                </View>
                <View style={styles.totalsDivider} />
                <View style={styles.totalsCol}>
                  <Text style={styles.totalsLabel}>Versé</Text>
                  <Text style={[styles.totalsValue, { color: COLORS.success }]}>
                    {totals.totalVerse.toLocaleString()} DA
                  </Text>
                </View>
                <View style={styles.totalsDivider} />
                <View style={styles.totalsCol}>
                  <Text style={styles.totalsLabel}>Reste</Text>
                  <Text style={[styles.totalsValue, { color: totals.totalReste > 0 ? COLORS.danger : COLORS.success }]}>
                    {totals.totalReste.toLocaleString()} DA
                  </Text>
                </View>
              </View>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="cash-remove" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucun paiement pour ces filtres</Text>
          </View>
        }
      />

      {/* Modal de filtrage Discipline & Catégorie */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable style={styles.modalBg} onPress={() => setShowFilterModal(false)}>
          <Pressable style={styles.modalContent} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrer les paiements</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <Text style={styles.modalSectionTitle}>Discipline</Text>
              <FilterBar
                filters={[
                  { value: 'all', label: 'Toutes les disciplines', icon: '🥋' },
                  ...activeDisciplines.map(d => ({ value: d, label: d, icon: '⚡' })),
                ]}
                activeFilter={disciplineFilter}
                onSelect={setDisciplineFilter}
              />

              <Text style={[styles.modalSectionTitle, { marginTop: 16 }]}>Catégorie d'âge</Text>
              <FilterBar
                filters={[
                  { value: 'all', label: 'Toutes les catégories', icon: '🏆' },
                  ...CATEGORIES.map(c => ({ value: c.label, label: c.label, icon: c.icon })),
                ]}
                activeFilter={categoryFilter}
                onSelect={setCategoryFilter}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalResetBtn}
                onPress={resetSubFilters}
              >
                <Text style={styles.modalResetText}>Réinitialiser</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={() => setShowFilterModal(false)}
              >
                <Text style={styles.modalApplyText}>Appliquer les filtres</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerContainer: { paddingBottom: 8 },
  banner: {
    backgroundColor: COLORS.bgCard,
    margin: 16,
    marginBottom: 8,
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 16 },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
  },
  printBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  bannerAmts: { flexDirection: 'row', gap: 24 },
  bannerAmt: { gap: 2 },
  bannerAmtValue: { color: COLORS.success, fontWeight: '800', fontSize: 18 },
  bannerAmtLabel: { color: COLORS.textMuted, fontSize: 12 },
  filterSection: { marginBottom: 6 },
  filterSectionTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subFilterBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
  },
  filterTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flex: 1,
  },
  filterTriggerBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  filterTriggerText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resetBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  activeBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary + '15',
    borderColor: COLORS.primary + '40',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  activeBadgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  totalsFooter: {
    marginHorizontal: 0,
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  totalsCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  totalsDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },
  totalsLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalsValue: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 20,
    gap: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  modalSectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalResetBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalResetText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  modalApplyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  modalApplyText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
