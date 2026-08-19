// src/screens/admin/PaymentListScreen.js
// Hub de gestion des paiements, bilans financiers périodiques et alertes adhérents
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import PaymentCard from '../../components/PaymentCard';
import FilterBar from '../../components/FilterBar';
import useTheme from '../../theme/useTheme';
import {
  getAllPaiementsBySaison,
  refreshPaymentStatuses,
  generatePaymentAlertsForSaison,
  sendPaymentReminderToAdherent,
} from '../../database/database';
import { PAYMENT_STATUS, getStatusLabel, getStatusColor } from '../../utils/payments';
import { CATEGORIES, getEffectiveCategory, DISCIPLINES } from '../../utils/categories';
import DateField from '../../components/DateField';
import {
  getWeeklyFinancialReport,
  getIntervalFinancialReport,
  getMonthlyFinancialReport,
  getSeasonFinancialReport,
  getWeekBounds,
  printFinancialReport,
} from '../../utils/financialReports';

export default function PaymentListScreen({ navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const { saisonActive, saisons, loadSaisons, disciplines, loadDisciplines } = useStore();

  // Mode principal : 'paiements' ou 'bilans'
  const [mainTab, setMainTab] = useState('paiements');

  // Sous-onglet bilans : 'hebdo' | 'mensuel' | 'saison'
  const [bilanType, setBilanType] = useState('hebdo');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // Intervalle de dates personnalisé pour le bilan hebdomadaire / personnalisé
  const defaultBounds = useMemo(() => getWeekBounds(), []);
  const [customStartDate, setCustomStartDate] = useState(defaultBounds.start.toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState(defaultBounds.end.toISOString().slice(0, 10));

  const [paiements, setPaiements] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'inscription' | 'mensualite' | 'avance' | 'retard' | 'dette'
  const [statusFilter, setStatusFilter] = useState('all');
  const [disciplineFilter, setDisciplineFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const [selectedSaisonId, setSelectedSaisonId] = useState(null);

  // Modal de rappel personnalisé
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [customMsg, setCustomMsg] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);

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

  // Calcul dynamique de la catégorie
  const paiementsWithCategory = useMemo(() => {
    return paiements.map(p => {
      const category = getEffectiveCategory(p);
      return {
        ...p,
        categoryLabel: category.label,
      };
    });
  }, [paiements]);

  // Filtrage combiné complet (sur les lignes brutes)
  const filtered = useMemo(() => {
    return paiementsWithCategory.filter(p => {
      // Filtre de type / catégorie de créance
      if (typeFilter === 'inscription' && p.type !== 'inscription') return false;
      if (typeFilter === 'mensualite' && p.type !== 'mensualite') return false;
      if (typeFilter === 'avance' && p.statut !== PAYMENT_STATUS.AVANCE) return false;
      if (typeFilter === 'retard' && p.statut !== PAYMENT_STATUS.EN_RETARD) return false;
      if (typeFilter === 'dette') {
        const du = p.montantDu || 0;
        const paye = p.montantPaye || 0;
        if (du - paye <= 0) return false;
      }

      // Filtre statut
      const matchStatus = statusFilter === 'all' || p.statut === statusFilter;

      // Filtre discipline
      const pDisc = (p.discipline || '').trim().toLowerCase();
      const fDisc = disciplineFilter.trim().toLowerCase();
      const matchDiscipline = disciplineFilter === 'all' || pDisc === fDisc;

      // Filtre catégorie
      const pCat = (p.categoryLabel || '').trim().toLowerCase();
      const fCat = categoryFilter.trim().toLowerCase();
      const matchCategory = categoryFilter === 'all' || pCat === fCat;

      // Recherche texte
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        (p.nom && p.nom.toLowerCase().includes(q)) ||
        (p.prenom && p.prenom.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.label && p.label.toLowerCase().includes(q));

      return matchStatus && matchDiscipline && matchCategory && matchSearch;
    });
  }, [paiementsWithCategory, typeFilter, statusFilter, disciplineFilter, categoryFilter, search]);

  // Grouper les paiements filtrés par adhérent → une entrée par adhérent
  const adherentsGroupes = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.adherentId;
      if (!map.has(key)) {
        map.set(key, {
          adherentId: p.adherentId,
          nom: p.nom || '',
          prenom: p.prenom || '',
          code: p.code || '',
          discipline: p.discipline || '',
          categoryLabel: p.categoryLabel || '',
          paiements: [],
          totalDu: 0,
          totalPaye: 0,
          hasRetard: false,
          hasAvance: false,
          hasDette: false,
          nbInscription: 0,
          nbMensualites: 0,
        });
      }
      const g = map.get(key);
      g.paiements.push(p);
      g.totalDu += p.montantDu || 0;
      g.totalPaye += p.montantPaye || 0;
      if (p.statut === PAYMENT_STATUS.EN_RETARD) g.hasRetard = true;
      if (p.statut === PAYMENT_STATUS.AVANCE) g.hasAvance = true;
      if (p.type === 'inscription') g.nbInscription++;
      if (p.type === 'mensualite') g.nbMensualites++;
    }
    return Array.from(map.values()).map(g => {
      g.reste = Math.max(0, g.totalDu - g.totalPaye);
      g.hasDette = g.reste > 0;
      if (g.hasRetard) g.statutGlobal = PAYMENT_STATUS.EN_RETARD;
      else if (g.hasDette) g.statutGlobal = PAYMENT_STATUS.A_PAYER;
      else if (g.hasAvance) g.statutGlobal = PAYMENT_STATUS.AVANCE;
      else g.statutGlobal = PAYMENT_STATUS.PAYE;
      return g;
    }).sort((a, b) => {
      if (a.hasRetard && !b.hasRetard) return -1;
      if (!a.hasRetard && b.hasRetard) return 1;
      if (a.hasDette && !b.hasDette) return -1;
      if (!a.hasDette && b.hasDette) return 1;
      return a.nom.localeCompare(b.nom);
    });
  }, [filtered]);

  // Totaux statistiques globaux pour la saison
  const statsOverview = useMemo(() => {
    const totalDu = paiements.reduce((s, p) => s + (p.montantDu || 0), 0);
    const totalVerse = paiements.reduce((s, p) => s + (p.montantPaye || 0), 0);
    const totalDettes = Math.max(0, totalDu - totalVerse);

    const inscriptions = paiements.filter(p => p.type === 'inscription');
    const totalInscriptions = inscriptions.reduce((s, p) => s + (p.montantPaye || 0), 0);

    const mensualites = paiements.filter(p => p.type === 'mensualite');
    const totalMensualites = mensualites.reduce((s, p) => s + (p.montantPaye || 0), 0);

    const avances = paiements.filter(p => p.statut === PAYMENT_STATUS.AVANCE);
    const totalAvances = avances.reduce((s, p) => s + (p.montantPaye || 0), 0);

    const retards = paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD);
    const totalRetards = retards.reduce((s, p) => s + Math.max(0, (p.montantDu || 0) - (p.montantPaye || 0)), 0);

    return {
      totalDu,
      totalVerse,
      totalDettes,
      totalInscriptions,
      totalMensualites,
      totalAvances,
      nbAvances: avances.length,
      totalRetards,
      nbRetards: retards.length,
    };
  }, [paiements]);

  // Rapports financiers
  const intervalReport = useMemo(() =>
    getIntervalFinancialReport(paiements, customStartDate, customEndDate),
    [paiements, customStartDate, customEndDate]
  );
  const monthlyReport = useMemo(() =>
    getMonthlyFinancialReport(paiements, selectedMonth, saison?.annee || new Date().getFullYear()),
    [paiements, selectedMonth, saison]
  );
  const seasonReport = useMemo(() =>
    getSeasonFinancialReport(paiements, saison),
    [paiements, saison]
  );

  const activeBilanReport = useMemo(() => {
    if (bilanType === 'hebdo') return intervalReport;
    if (bilanType === 'mensuel') return monthlyReport;
    return seasonReport;
  }, [bilanType, intervalReport, monthlyReport, seasonReport]);

  // Déclencher les alertes automatiques à tous les retardataires
  const handleAlerterRetardataires = async () => {
    if (!saison) {
      Alert.alert('Information', 'Aucune saison active sélectionnée.');
      return;
    }
    setAlerting(true);
    try {
      const res = await generatePaymentAlertsForSaison(saison.id);
      Alert.alert(
        '✅ Alertes envoyées',
        `Analyse terminée :\n• ${res.retardsCreated} alerte(s) de retard générée(s)\n• ${res.echeancesCreated} rappel(s) de renouvellement (7 jours) envoyé(s).`
      );
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de générer les alertes');
    } finally {
      setAlerting(false);
    }
  };

  // Envoi d'un rappel individuel
  const handleSendSingleReminder = async () => {
    if (!reminderTarget || !saison) return;
    setSendingReminder(true);
    try {
      await sendPaymentReminderToAdherent(
        reminderTarget.adherentId,
        saison.id,
        'retard',
        customMsg.trim() || null
      );
      setShowReminderModal(false);
      setCustomMsg('');
      Alert.alert('✅ Rappel envoyé', `Le rappel a été transmis à ${reminderTarget.prenom} ${reminderTarget.nom}.`);
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Échec de l\'envoi du rappel');
    } finally {
      setSendingReminder(false);
    }
  };

  // Impression du bilan actif
  const handlePrintBilan = async () => {
    setPrinting(true);
    try {
      await printFinancialReport({
        report: activeBilanReport,
        saison,
        clubName: 'CMB CLUB',
      });
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Erreur lors de l\'impression');
    } finally {
      setPrinting(false);
    }
  };

  const TYPE_FILTERS = [
    { value: 'all', label: 'Tous', icon: '📋' },
    { value: 'inscription', label: 'Inscriptions', icon: '📝' },
    { value: 'mensualite', label: 'Mensualités', icon: '📅' },
    { value: 'avance', label: `Avances (${statsOverview.nbAvances})`, icon: '🔵' },
    { value: 'retard', label: `Retards (${statsOverview.nbRetards})`, icon: '⚠️' },
    { value: 'dette', label: 'Dettes & Reste', icon: '💳' },
  ];

  const MOIS_LIST = [
    { num: 1, label: 'Jan' }, { num: 2, label: 'Fév' }, { num: 3, label: 'Mar' },
    { num: 4, label: 'Avr' }, { num: 5, label: 'Mai' }, { num: 6, label: 'Juin' },
    { num: 7, label: 'Juil' }, { num: 8, label: 'Août' }, { num: 9, label: 'Sept' },
    { num: 10, label: 'Oct' }, { num: 11, label: 'Nov' }, { num: 12, label: 'Déc' },
  ];

  return (
    <View style={styles.container}>
      {/* ── Sélecteur d'onglet principal (Paiements vs Bilans) ── */}
      <View style={styles.mainTabWrapper}>
        <TouchableOpacity
          style={[styles.mainTabBtn, mainTab === 'paiements' && styles.mainTabBtnActive]}
          onPress={() => setMainTab('paiements')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="cash-multiple"
            size={18}
            color={mainTab === 'paiements' ? '#FFF' : COLORS.textMuted}
          />
          <Text style={[styles.mainTabTxt, mainTab === 'paiements' && styles.mainTabTxtActive]}>
            Paiements & Dettes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTabBtn, mainTab === 'bilans' && styles.mainTabBtnActive]}
          onPress={() => setMainTab('bilans')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="chart-bar"
            size={18}
            color={mainTab === 'bilans' ? '#FFF' : COLORS.textMuted}
          />
          <Text style={[styles.mainTabTxt, mainTab === 'bilans' && styles.mainTabTxtActive]}>
            Bilans Financiers
          </Text>
        </TouchableOpacity>
      </View>

      {mainTab === 'paiements' ? (
        /* ══════════════════════════════════════════════════════════════════════
           VUE 1 : PAIEMENTS & CONSULTATION PAR ADHÉRENT
        ══════════════════════════════════════════════════════════════════════ */
        <FlatList
          data={adherentsGroupes}
          keyExtractor={item => item.adherentId}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              {/* Bannière financière globale */}
              <View style={styles.kpiCardContainer}>
                <View style={styles.kpiRow}>
                  <View style={styles.kpiBox}>
                    <Text style={styles.kpiVal} numberOfLines={1}>{(statsOverview.totalVerse / 1000).toFixed(1)}k</Text>
                    <Text style={styles.kpiLbl}>Encaissé (DA)</Text>
                  </View>
                  <View style={styles.kpiDivider} />
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiVal, { color: COLORS.danger }]} numberOfLines={1}>{(statsOverview.totalRetards / 1000).toFixed(1)}k</Text>
                    <Text style={styles.kpiLbl}>Retards (DA)</Text>
                  </View>
                  <View style={styles.kpiDivider} />
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiVal, { color: COLORS.warning }]} numberOfLines={1}>{(statsOverview.totalDettes / 1000).toFixed(1)}k</Text>
                    <Text style={styles.kpiLbl}>Dettes (DA)</Text>
                  </View>
                  <View style={styles.kpiDivider} />
                  <View style={styles.kpiBox}>
                    <Text style={[styles.kpiVal, { color: COLORS.info }]} numberOfLines={1}>{(statsOverview.totalAvances / 1000).toFixed(1)}k</Text>
                    <Text style={styles.kpiLbl}>Avances (DA)</Text>
                  </View>
                </View>

                {/* Bouton d'alerte groupée aux retardataires */}
                <TouchableOpacity
                  style={styles.alertBtn}
                  onPress={handleAlerterRetardataires}
                  disabled={alerting}
                  activeOpacity={0.8}
                >
                  {alerting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="bell-ring" size={17} color="#FFF" />
                      <Text style={styles.alertBtnTxt}>Alerter les retardataires & préavis 7j</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Barre de recherche */}
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Rechercher par adhérent, code..."
                  placeholderTextColor={COLORS.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Filtres par type de créance */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeChipsRow}>
                {TYPE_FILTERS.map(f => {
                  const active = typeFilter === f.value;
                  return (
                    <TouchableOpacity
                      key={f.value}
                      style={[styles.typeChip, active && styles.typeChipActive]}
                      onPress={() => setTypeFilter(f.value)}
                    >
                      <Text style={styles.typeChipIcon}>{f.icon}</Text>
                      <Text style={[styles.typeChipTxt, active && styles.typeChipTxtActive]}>{f.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.countText}>
                {adherentsGroupes.length} adhérent{adherentsGroupes.length > 1 ? 's' : ''} trouvé{adherentsGroupes.length > 1 ? 's' : ''}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const stColor = getStatusColor(item.statutGlobal);
            const stLabel = getStatusLabel(item.statutGlobal);
            const pctPaye = item.totalDu > 0 ? Math.round((item.totalPaye / item.totalDu) * 100) : 100;

            return (
              <TouchableOpacity
                style={styles.paymentCard}
                onPress={() => navigation.navigate('PaymentDetail', { adherentId: item.adherentId })}
                activeOpacity={0.8}
              >
                {/* En-tête : Nom + statut global */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adherentName} numberOfLines={1}>
                      {item.nom ? item.nom.toUpperCase() : ''} {item.prenom || ''}
                    </Text>
                    <View style={styles.metaRow}>
                      {item.code ? <Text style={styles.codeTag}>{item.code}</Text> : null}
                      <Text style={styles.discTag}>{item.discipline || 'Natation'}</Text>
                      {item.categoryLabel ? <Text style={styles.catTag}>{item.categoryLabel}</Text> : null}
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: stColor + '18', borderColor: stColor + '50' }]}>
                    <Text style={[styles.statusTxt, { color: stColor }]}>{stLabel}</Text>
                  </View>
                </View>

                {/* Résumé des paiements : Inscription + mois */}
                <View style={styles.cardBody}>
                  <View style={styles.itemLabelRow}>
                    {item.nbInscription > 0 && (
                      <View style={styles.badgeChip}>
                        <MaterialCommunityIcons name="card-account-details-outline" size={12} color={COLORS.primary} />
                        <Text style={styles.badgeChipTxt}>Inscription</Text>
                      </View>
                    )}
                    {item.nbMensualites > 0 && (
                      <View style={styles.badgeChip}>
                        <MaterialCommunityIcons name="calendar-month" size={12} color="#A855F7" />
                        <Text style={[styles.badgeChipTxt, { color: '#A855F7' }]}>{item.nbMensualites} mois</Text>
                      </View>
                    )}
                  </View>

                  {/* Barre de progression */}
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, {
                      width: `${Math.min(100, pctPaye)}%`,
                      backgroundColor: pctPaye >= 100 ? COLORS.success : pctPaye >= 50 ? COLORS.primary : COLORS.danger,
                    }]} />
                  </View>

                  <View style={styles.amountsGrid}>
                    <View style={styles.amtCol}>
                      <Text style={styles.amtVal}>{item.totalDu.toLocaleString()} DA</Text>
                      <Text style={styles.amtLbl}>Dû</Text>
                    </View>
                    <View style={styles.amtCol}>
                      <Text style={[styles.amtVal, { color: COLORS.success }]}>{item.totalPaye.toLocaleString()} DA</Text>
                      <Text style={styles.amtLbl}>Versé</Text>
                    </View>
                    <View style={styles.amtCol}>
                      <Text style={[styles.amtVal, { color: item.reste > 0 ? COLORS.danger : COLORS.textMuted }]}>
                        {item.reste.toLocaleString()} DA
                      </Text>
                      <Text style={styles.amtLbl}>Reste</Text>
                    </View>
                  </View>
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <View style={styles.detailBtn}>
                    <MaterialCommunityIcons name="eye-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.detailBtnTxt}>Voir détail & régler</Text>
                  </View>
                  {item.reste > 0 && (
                    <TouchableOpacity
                      style={styles.reminderBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setReminderTarget({ ...item, adherentId: item.adherentId });
                        setShowReminderModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="bell-outline" size={14} color="#F59E0B" />
                      <Text style={styles.reminderBtnTxt}>Rappeler</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-cash-outline" size={44} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Aucun adhérent correspondant aux filtres.</Text>
            </View>
          }
        />

      ) : (
        /* ══════════════════════════════════════════════════════════════════════
           VUE 2 : BILANS FINANCIERS (HEBDO, MENSUEL, SAISON)
        ══════════════════════════════════════════════════════════════════════ */
        <ScrollView style={styles.bilanScroll} contentContainerStyle={styles.bilanContent}>
          {/* Sélecteur de période */}
          <View style={styles.bilanTypeSelector}>
            {[
              { id: 'hebdo', label: 'Hebdomadaire', icon: 'calendar-week' },
              { id: 'mensuel', label: 'Mensuel', icon: 'calendar-month' },
              { id: 'saison', label: 'Saison Complète', icon: 'trophy-award' },
            ].map(tab => {
              const active = bilanType === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.bilanTypeBtn, active && styles.bilanTypeBtnActive]}
                  onPress={() => setBilanType(tab.id)}
                >
                  <MaterialCommunityIcons
                    name={tab.icon}
                    size={16}
                    color={active ? '#FFF' : COLORS.textMuted}
                  />
                  <Text style={[styles.bilanTypeTxt, active && styles.bilanTypeTxtActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Sélecteur d'intervalle de dates si Hebdo / Intervalle */}
          {bilanType === 'hebdo' && (
            <View style={styles.intervalCard}>
              <View style={styles.intervalHeader}>
                <MaterialCommunityIcons name="calendar-range" size={18} color={COLORS.primary} />
                <Text style={styles.intervalCardTitle}>Intervalle de dates personnalisé</Text>
              </View>

              <View style={styles.intervalFieldsRow}>
                <View style={{ flex: 1 }}>
                  <DateField
                    label="Date Début"
                    value={customStartDate}
                    onChange={setCustomStartDate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <DateField
                    label="Date Fin"
                    value={customEndDate}
                    onChange={setCustomEndDate}
                  />
                </View>
              </View>

              {/* Raccourcis rapides */}
              <View style={styles.intervalShortcutsRow}>
                <TouchableOpacity
                  style={styles.shortcutChip}
                  onPress={() => {
                    const { start, end } = getWeekBounds();
                    setCustomStartDate(start.toISOString().slice(0, 10));
                    setCustomEndDate(end.toISOString().slice(0, 10));
                  }}
                >
                  <Text style={styles.shortcutTxt}>Cette semaine</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shortcutChip}
                  onPress={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - 7);
                    setCustomStartDate(start.toISOString().slice(0, 10));
                    setCustomEndDate(end.toISOString().slice(0, 10));
                  }}
                >
                  <Text style={styles.shortcutTxt}>7 derniers jours</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shortcutChip}
                  onPress={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - 14);
                    setCustomStartDate(start.toISOString().slice(0, 10));
                    setCustomEndDate(end.toISOString().slice(0, 10));
                  }}
                >
                  <Text style={styles.shortcutTxt}>14 derniers jours</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Sélecteur de mois si mensuel */}
          {bilanType === 'mensuel' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthsRow}>
              {MOIS_LIST.map(m => {
                const active = selectedMonth === m.num;
                return (
                  <TouchableOpacity
                    key={m.num}
                    style={[styles.monthChip, active && styles.monthChipActive]}
                    onPress={() => setSelectedMonth(m.num)}
                  >
                    <Text style={[styles.monthChipTxt, active && styles.monthChipTxtActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* En-tête du bilan actif */}
          <View style={styles.bilanHeaderCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bilanHeaderTitle}>{activeBilanReport.periodLabel}</Text>
              <Text style={styles.bilanHeaderSub}>
                {saison ? `Saison ${saison.label}` : 'Toutes saisons'} · CMB CLUB
              </Text>
            </View>
            <TouchableOpacity
              style={styles.printBilanBtn}
              onPress={handlePrintBilan}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="printer" size={16} color="#FFF" />
                  <Text style={styles.printBilanBtnTxt}>Imprimer PDF</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* KPIs du rapport */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiGridCard}>
              <Text style={[styles.kpiGridVal, { color: '#0284C7' }]}>
                {((activeBilanReport.totalDuGlobal ?? activeBilanReport.totalDu ?? 0)).toLocaleString()} DA
              </Text>
              <Text style={styles.kpiGridLbl}>Total Dû</Text>
            </View>

            <View style={styles.kpiGridCard}>
              <Text style={[styles.kpiGridVal, { color: '#10B981' }]}>
                {((activeBilanReport.totalEncaisseGlobal ?? activeBilanReport.totalEncaisse ?? 0)).toLocaleString()} DA
              </Text>
              <Text style={styles.kpiGridLbl}>Total Encaissé</Text>
            </View>

            <View style={styles.kpiGridCard}>
              <Text style={[styles.kpiGridVal, { color: '#EF4444' }]}>
                {((activeBilanReport.totalResteGlobal ?? activeBilanReport.totalDettes ?? activeBilanReport.totalRetards ?? 0)).toLocaleString()} DA
              </Text>
              <Text style={styles.kpiGridLbl}>Reste / Dettes</Text>
            </View>

            <View style={styles.kpiGridCard}>
              <Text style={[styles.kpiGridVal, { color: '#8B5CF6' }]}>
                {activeBilanReport.tauxRecouvrement ?? 0}%
              </Text>
              <Text style={styles.kpiGridLbl}>Taux Recouvrement</Text>
            </View>
          </View>

          {/* Détail par Discipline */}
          <View style={styles.disciplineSection}>
            <Text style={styles.sectionHeading}>Répartition par Discipline</Text>
            {Object.keys(activeBilanReport.parDiscipline || {}).length === 0 ? (
              <Text style={styles.noDataTxt}>Aucune donnée enregistrée pour cette période.</Text>
            ) : (
              Object.entries(activeBilanReport.parDiscipline).map(([disc, st]) => {
                const du = typeof st === 'number' ? st : (st.du || 0);
                const enc = typeof st === 'number' ? st : (st.encaisse || 0);
                const reste = typeof st === 'number' ? 0 : (st.reste || 0);
                const pct = du > 0 ? Math.round((enc / du) * 100) : (enc > 0 ? 100 : 0);

                return (
                  <View key={disc} style={styles.discRowCard}>
                    <View style={styles.discHeader}>
                      <Text style={styles.discName}>🥋 {disc}</Text>
                      <Text style={[styles.discPct, { color: pct >= 80 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444' }]}>
                        {pct}% encaissé
                      </Text>
                    </View>

                    <View style={styles.discBarBg}>
                      <View style={[styles.discBarFill, { width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 80 ? '#10B981' : '#0284C7' }]} />
                    </View>

                    <View style={styles.discNumbers}>
                      <Text style={styles.discNumTxt}>Dû : <Text style={styles.boldTxt}>{du.toLocaleString()} DA</Text></Text>
                      <Text style={[styles.discNumTxt, { color: '#10B981' }]}>Encaissé : <Text style={[styles.boldTxt, { color: '#10B981' }]}>{enc.toLocaleString()} DA</Text></Text>
                      {reste > 0 && (
                        <Text style={[styles.discNumTxt, { color: '#EF4444' }]}>Reste : <Text style={[styles.boldTxt, { color: '#EF4444' }]}>{reste.toLocaleString()} DA</Text></Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Modal de rappel personnalisé ── */}
      <Modal visible={showReminderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons name="bell-ring" size={22} color={COLORS.primary} />
              <Text style={styles.modalTitle}>Envoyer un rappel de paiement</Text>
            </View>

            {reminderTarget && (
              <Text style={styles.modalSub}>
                Adhérent : <Text style={styles.boldTxt}>{reminderTarget.nom?.toUpperCase()} {reminderTarget.prenom}</Text> ({reminderTarget.code})
              </Text>
            )}

            <Text style={styles.inputLabel}>Message personnalisé (facultatif) :</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Laissez vide pour utiliser le message d'alerte par défaut..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              value={customMsg}
              onChangeText={setCustomMsg}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowReminderModal(false); setCustomMsg(''); }}
              >
                <Text style={styles.cancelBtnTxt}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleSendSingleReminder}
                disabled={sendingReminder}
              >
                {sendingReminder ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.confirmBtnTxt}>Envoyer la notification</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg || '#0B1320' },

  // Onglets principaux
  mainTabWrapper: {
    flexDirection: 'row',
    backgroundColor: '#132032',
    padding: 6,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  mainTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  mainTabBtnActive: {
    backgroundColor: '#0284C7',
  },
  mainTabTxt: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  mainTabTxtActive: { color: '#FFF' },

  listContent: { paddingBottom: 100 },
  headerContainer: { paddingHorizontal: 16, paddingTop: 4 },

  // KPI Overview
  kpiCardContainer: {
    backgroundColor: '#132032',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  kpiBox: { flex: 1, alignItems: 'center' },
  kpiVal: { color: '#38BDF8', fontSize: 17, fontWeight: '900' },
  kpiLbl: { color: '#94A3B8', fontSize: 10.5, fontWeight: '600', marginTop: 2 },
  kpiDivider: { width: 1, height: 28, backgroundColor: 'rgba(255, 255, 255, 0.1)' },

  alertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    borderRadius: 12,
  },
  alertBtnTxt: { color: '#FFF', fontSize: 12.5, fontWeight: '700' },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#132032',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 13.5 },

  // Type Chips
  typeChipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  typeChipActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.2)',
    borderColor: '#0284C7',
  },
  typeChipIcon: { fontSize: 12 },
  typeChipTxt: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  typeChipTxtActive: { color: '#38BDF8', fontWeight: '700' },

  countText: { color: '#64748B', fontSize: 12, fontWeight: '700', marginBottom: 6 },

  // Payment card
  paymentCard: {
    backgroundColor: '#132032',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: 10,
    marginBottom: 10,
  },
  adherentName: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  codeTag: { color: '#64748B', fontSize: 11, fontFamily: 'monospace', fontWeight: '700' },
  discTag: { color: '#0284C7', fontSize: 11, fontWeight: '700' },
  catTag: { color: '#A855F7', fontSize: 11, fontWeight: '600' },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusTxt: { fontSize: 11, fontWeight: '700' },

  cardBody: { marginBottom: 10 },
  itemLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  itemLabel: { color: '#E2E8F0', fontSize: 13, fontWeight: '600' },

  // Badges inscription / mois
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.25)',
  },
  badgeChipTxt: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },

  // Barre de progression
  progressBg: {
    height: 5,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', borderRadius: 3 },

  amountsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 8,
  },
  amtCol: { flex: 1, alignItems: 'center' },
  amtVal: { color: '#FFF', fontSize: 13.5, fontWeight: '700' },
  amtLbl: { color: '#64748B', fontSize: 10, textTransform: 'uppercase', marginTop: 1 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8,
  },
  detailBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailBtnTxt: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  reminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  reminderBtnTxt: { color: '#F59E0B', fontSize: 11.5, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { color: '#64748B', fontSize: 14 },

  // ── Bilans Styles ──
  bilanScroll: { flex: 1 },
  bilanContent: { paddingHorizontal: 16, paddingBottom: 100 },
  bilanTypeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  bilanTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#132032',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  bilanTypeBtnActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  bilanTypeTxt: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  bilanTypeTxtActive: { color: '#FFF' },

  monthsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#132032',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  monthChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  monthChipTxt: { color: '#94A3B8', fontSize: 11.5, fontWeight: '600' },
  monthChipTxtActive: { color: '#FFF', fontWeight: '700' },

  // Intervalle de dates
  intervalCard: {
    backgroundColor: '#132032',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  intervalHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  intervalCardTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  intervalFieldsRow: { flexDirection: 'row', gap: 10 },
  intervalShortcutsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  shortcutChip: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  shortcutTxt: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },

  bilanHeaderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#132032',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  bilanHeaderTitle: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  bilanHeaderSub: { color: '#94A3B8', fontSize: 11.5, marginTop: 2 },
  printBilanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  printBilanBtnTxt: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiGridCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#132032',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  kpiGridVal: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  kpiGridLbl: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },

  disciplineSection: { marginTop: 4 },
  sectionHeading: { color: '#FFF', fontSize: 14, fontWeight: '800', marginBottom: 10 },
  discRowCard: {
    backgroundColor: '#132032',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  discHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  discName: { color: '#F8FAFC', fontSize: 13.5, fontWeight: '700' },
  discPct: { fontSize: 12.5, fontWeight: '800' },
  discBarBg: { height: 6, backgroundColor: '#0F172A', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  discBarFill: { height: '100%', borderRadius: 3 },
  discNumbers: { flexDirection: 'row', justifyContent: 'space-between' },
  discNumTxt: { color: '#94A3B8', fontSize: 11.5 },
  noDataTxt: { color: '#64748B', fontSize: 13, fontStyle: 'italic' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', maxWidth: 480, backgroundColor: '#132032', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  modalTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  modalSub: { color: '#94A3B8', fontSize: 13, marginBottom: 12 },
  inputLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  textArea: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    color: '#FFF',
    fontSize: 13,
    height: 90,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  cancelBtnTxt: { color: '#94A3B8', fontWeight: '700' },
  confirmBtn: { flex: 1.5, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#0284C7' },
  confirmBtnTxt: { color: '#FFF', fontWeight: '700' },
  boldTxt: { fontWeight: '700', color: '#FFF' },
});
