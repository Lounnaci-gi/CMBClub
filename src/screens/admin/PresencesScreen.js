// src/screens/admin/PresencesScreen.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, RefreshControl, Image, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { CATEGORIES } from '../../utils/categories';

const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentTimeString = (now = new Date()) => {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const isLateBy20Min = (heureDebutStr, now = new Date()) => {
  if (!heureDebutStr) return false;
  const match = String(heureDebutStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const slotHours = parseInt(match[1], 10);
  const slotMinutes = parseInt(match[2], 10);
  const slotTotalMinutes = slotHours * 60 + slotMinutes;
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
  return currentTotalMinutes > slotTotalMinutes + 20;
};

const getSlotStartDateTime = (dateStr, heureDebutStr) => {
  if (!dateStr || !heureDebutStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const match = String(heureDebutStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return new Date(parts[0], parts[1] - 1, parts[2], hours, minutes, 0);
};

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const getTodayJour = () => JOURS_FR[new Date().getDay()];

export default function PresencesScreen({ route }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const {
    creneaux, saisonActive, loadCreneaux, loadSaisons,
    getEligibleAdherents, getPresencesSeance, savePresencesSeance,
  } = useStore();

  const initialCreneauId = route?.params?.creneauId || null;

  // Selected state
  const [selectedCreneauId, setSelectedCreneauId] = useState(initialCreneauId);
  const [dateSeance, setDateSeance] = useState(getLocalDateString());
  const [statusFilter, setStatusFilter] = useState('tous'); // 'tous' | 'present' | 'absent' | 'retard' | 'excuse'
  const [scopeFilter, setScopeFilter] = useState('creneau'); // 'creneau' (créneau & discipline) | 'tous' (tous les adhérents)
  const [searchQuery, setSearchQuery] = useState('');
  const [adherents, setAdherents] = useState([]);
  const [presenceMap, setPresenceMap] = useState({}); // adherentId -> { statut, remarque }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());

  // Horloge en temps réel (mise à jour chaque seconde)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Only show slots matching today's day of the week
  const todayJour = useMemo(() => getTodayJour(), []);
  const creneauxDuJour = useMemo(
    () => creneaux.filter(c => c.jour === todayJour),
    [creneaux, todayJour],
  );

  const selectedCreneau = useMemo(() => {
    return creneauxDuJour.find(c => c.id === selectedCreneauId)
      || creneauxDuJour[0]
      || null;
  }, [creneauxDuJour, selectedCreneauId]);

  // Calcul du temps restant jusqu'au début du créneau
  const slotStartDateTime = useMemo(
    () => (selectedCreneau ? getSlotStartDateTime(dateSeance, selectedCreneau.heureDebut) : null),
    [dateSeance, selectedCreneau],
  );

  const isNotStartedYet = useMemo(() => {
    if (!slotStartDateTime) return false;
    return now.getTime() < slotStartDateTime.getTime();
  }, [now, slotStartDateTime]);

  const countdownFormatted = useMemo(() => {
    if (!slotStartDateTime || !isNotStartedYet) return null;
    const diffMs = slotStartDateTime.getTime() - now.getTime();
    if (diffMs <= 0) return null;

    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return { hh, mm, ss, totalSeconds };
  }, [now, slotStartDateTime, isNotStartedYet]);

  // Auto-select the first slot of today when loaded
  useEffect(() => {
    if (creneauxDuJour.length > 0) {
      const already = creneauxDuJour.find(c => c.id === selectedCreneauId);
      if (!already) setSelectedCreneauId(creneauxDuJour[0].id);
    }
  }, [creneauxDuJour]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await loadSaisons();
      await loadCreneaux();
      const currentCreneaux = useStore.getState().creneaux;
      const currentSaison = useStore.getState().saisonActive;

      const targetCreneau = currentCreneaux.find(c => c.id === selectedCreneauId) || currentCreneaux[0] || null;
      if (!selectedCreneauId && targetCreneau) {
        setSelectedCreneauId(targetCreneau.id);
      }

      if (!targetCreneau) {
        setAdherents([]);
        setPresenceMap({});
        return;
      }

      const eligible = await getEligibleAdherents(targetCreneau.id, currentSaison?.id);
      setAdherents(eligible);

      const existing = await getPresencesSeance(targetCreneau.id, dateSeance);
      const map = {};

      eligible.forEach(a => {
        const found = existing.find(p => p.adherentId === a.id);
        if (found) {
          map[a.id] = { statut: found.statut, remarque: found.remarque || '' };
        } else {
          map[a.id] = { statut: 'present', remarque: '' };
        }
      });
      setPresenceMap(map);
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de charger les présences.');
    } finally {
      setLoading(false);
    }
  }, [selectedCreneauId, dateSeance, getEligibleAdherents, getPresencesSeance, loadCreneaux, loadSaisons]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handlePrevDay = () => {
    const parts = dateSeance.split('-').map(Number);
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      d.setDate(d.getDate() - 1);
      setDateSeance(getLocalDateString(d));
    }
  };

  const handleNextDay = () => {
    const todayStr = getLocalDateString();
    const parts = dateSeance.split('-').map(Number);
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      d.setDate(d.getDate() + 1);
      const nextStr = getLocalDateString(d);
      if (nextStr > todayStr) {
        Alert.alert('Date future non autorisée', 'Impossible d\'enregistrer les présences pour une date future.');
        return;
      }
      setDateSeance(nextStr);
    }
  };

  const handleToday = () => {
    setDateSeance(getLocalDateString());
  };

  const handleYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setDateSeance(getLocalDateString(d));
  };

  const handleStatutChange = (adherentId, targetStatut) => {
    if (isNotStartedYet) {
      Alert.alert('Créneau non débuté', 'L\'appel est bloqué jusqu\'au début du créneau.');
      return;
    }
    const now = new Date();
    const timeStr = getCurrentTimeString(now);
    const startStr = selectedCreneau?.heureDebut;
    const isLate = isLateBy20Min(startStr, now);

    let finalStatut = targetStatut;
    let autoText = '';

    if (targetStatut === 'present') {
      if (isLate) {
        finalStatut = 'retard';
        autoText = `Retard (${timeStr} - >20 min créneau ${startStr || ''})`;
      } else {
        finalStatut = 'present';
        autoText = `Présent à ${timeStr}`;
      }
    } else if (targetStatut === 'absent') {
      finalStatut = 'absent';
      autoText = `Absent (${timeStr})`;
    }

    setPresenceMap(prev => {
      const existingRemarque = prev[adherentId]?.remarque || '';
      let newRemarque = autoText;
      if (existingRemarque && !/^(Présent à|Absent \(|Retard \()/i.test(existingRemarque)) {
        newRemarque = `${autoText} - ${existingRemarque}`;
      }

      return {
        ...prev,
        [adherentId]: {
          ...prev[adherentId],
          statut: finalStatut,
          remarque: newRemarque,
        },
      };
    });
  };

  const handleRemarqueChange = (adherentId, remarque) => {
    setPresenceMap(prev => ({
      ...prev,
      [adherentId]: { ...prev[adherentId], remarque },
    }));
  };

  const handleMarkAllPresent = () => {
    if (isNotStartedYet) {
      Alert.alert('Créneau non débuté', 'L\'appel est bloqué jusqu\'au début du créneau.');
      return;
    }
    const now = new Date();
    const timeStr = getCurrentTimeString(now);
    const startStr = selectedCreneau?.heureDebut;
    const isLate = isLateBy20Min(startStr, now);
    const finalStatut = isLate ? 'retard' : 'present';
    const autoText = isLate ? `Retard (${timeStr} - >20 min créneau ${startStr || ''})` : `Présent à ${timeStr}`;

    setPresenceMap(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id] = { ...next[id], statut: finalStatut, remarque: autoText };
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (isNotStartedYet) {
      Alert.alert('Action interdite', 'L\'enregistrement des présences est impossible avant le début du créneau.');
      return;
    }
    const todayStr = getLocalDateString();
    if (dateSeance > todayStr) {
      Alert.alert('Action interdite', 'L\'enregistrement des présences est strictement interdit pour les dates futures.');
      return;
    }
    const targetCreneau = selectedCreneau || creneaux[0];
    if (!targetCreneau) {
      Alert.alert('Erreur', 'Aucun créneau sélectionné.');
      return;
    }
    setSaving(true);
    try {
      const list = Object.entries(presenceMap).map(([adherentId, data]) => ({
        adherentId,
        statut: data.statut,
        remarque: data.remarque,
      }));
      await savePresencesSeance(targetCreneau.id, dateSeance, saisonActive?.id, list);

      const parts = dateSeance.split('-').map(Number);
      let dateLabel = dateSeance;
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        dateLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      }

      Alert.alert('Présences enregistrées', `Les présences pour la séance du ${dateLabel} ont été enregistrées avec succès.`);
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d’enregistrer.');
    } finally {
      setSaving(false);
    }
  };

  const filteredAdherents = useMemo(() => {
    const { getCategoryByAge } = require('../../utils/categories');

    return adherents.filter(a => {
      // Status Filter
      const matchesStatus = statusFilter === 'tous' || (presenceMap[a.id]?.statut || 'present') === statusFilter;

      // Search Query
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        a.nom.toLowerCase().includes(q) ||
        a.prenom.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q);

      // Scope Filter (creneau vs tous)
      let matchesScope = true;
      if (scopeFilter === 'creneau' && selectedCreneau) {
        const creneauDiscip = (selectedCreneau.discipline || '').trim().toLowerCase();
        const creneauCat = (selectedCreneau.categorie || '').trim().toLowerCase();

        const adhDiscip = (a.discipline || '').trim().toLowerCase();
        const matchDisc = !adhDiscip ||
          !creneauDiscip ||
          creneauDiscip.includes('tout') ||
          adhDiscip.includes(creneauDiscip) ||
          creneauDiscip.includes(adhDiscip);

        const catObj = getCategoryByAge(a.dateNaissance);
        const catLabel = (catObj?.label || '').trim().toLowerCase();
        const matchCat = !creneauCat ||
          creneauCat.includes('tout') ||
          catLabel === creneauCat;

        matchesScope = matchDisc && matchCat;
      }

      return matchesStatus && matchesSearch && matchesScope;
    });
  }, [adherents, presenceMap, statusFilter, searchQuery, scopeFilter, selectedCreneau]);

  // Quick Stats
  const statsSummary = useMemo(() => {
    let presents = 0, absents = 0, retards = 0;
    filteredAdherents.forEach(a => {
      const p = presenceMap[a.id] || { statut: 'present' };
      if (p.statut === 'present') presents++;
      else if (p.statut === 'absent') absents++;
      else if (p.statut === 'retard') retards++;
    });
    return { total: filteredAdherents.length, presents, absents, retards };
  }, [presenceMap, filteredAdherents]);

  const catObj = selectedCreneau ? CATEGORIES.find(c => c.label === selectedCreneau.categorie) : null;

  const todayStr = getLocalDateString();
  const isToday = dateSeance === todayStr;
  const isFuture = dateSeance > todayStr;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Creneaux Selector - only slots for today */}
      <View style={styles.selectorSection}>
        <View style={styles.selectorHeader}>
          <MaterialCommunityIcons name="calendar-today" size={14} color={COLORS.primary} />
          <Text style={styles.sectionLabel}>
            Créneaux du {todayJour} :
          </Text>
        </View>
        {creneauxDuJour.length === 0 ? (
          <View style={styles.noSlotToday}>
            <MaterialCommunityIcons name="calendar-remove" size={20} color={COLORS.textMuted} />
            <Text style={styles.noSlotTodayText}>Aucun créneau prévu aujourd'hui ({todayJour})</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creneauScroll}>
            {creneauxDuJour.map(c => {
              const isSelected = c.id === selectedCreneau?.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.creneauChip, isSelected && styles.creneauChipSelected]}
                  onPress={() => setSelectedCreneauId(c.id)}
                >
                  <Text style={[styles.creneauChipText, isSelected && styles.creneauChipTextSelected]}>
                    {c.discipline} · {c.heureDebut}
                  </Text>
                  <Text style={[styles.creneauChipCat, isSelected && { color: COLORS.primary }]}>
                    {c.categorie}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Date & Quick Shortcuts */}
      {selectedCreneau && (
        <View style={styles.dateBar}>
          <View style={styles.dateControlRow}>
            <TouchableOpacity onPress={handlePrevDay} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={COLORS.primary} />
            </TouchableOpacity>

            <View style={styles.dateBox}>
              <MaterialCommunityIcons name="calendar" size={16} color={COLORS.secondary} />
              <TextInput
                style={styles.dateInput}
                value={dateSeance}
                onChangeText={setDateSeance}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <TouchableOpacity onPress={handleNextDay} style={styles.dateNavBtn}>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Quick Date Presets */}
          <View style={styles.dateShortcuts}>
            <TouchableOpacity onPress={handleYesterday} style={styles.shortcutChip}>
              <Text style={styles.shortcutText}>Hier</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToday} style={[styles.shortcutChip, isToday && styles.shortcutChipActive]}>
              <Text style={[styles.shortcutText, isToday && styles.shortcutTextActive]}>Auj.</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.markAllBtn, isFuture && { opacity: 0.5 }]} onPress={handleMarkAllPresent} disabled={isFuture}>
            <MaterialCommunityIcons name="check-all" size={16} color={COLORS.success} />
            <Text style={styles.markAllText}>Tout présent</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Warning Banner if Future Date */}
      {isFuture && (
        <View style={styles.futureWarningBox}>
          <MaterialCommunityIcons name="alert-decagram" size={18} color={COLORS.danger} />
          <Text style={styles.futureWarningText}>
            Saisie interdite : La date sélectionnée ({dateSeance}) est dans le futur.
          </Text>
        </View>
      )}

      {/* Affichage du chrono si le créneau n'a pas encore débuté */}
      {isNotStartedYet && countdownFormatted ? (
        <View style={styles.countdownContainer}>
          <View style={styles.countdownCard}>
            <View style={styles.countdownIconBg}>
              <MaterialCommunityIcons name="clock-start" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.countdownTitle}>Créneau non débuté</Text>
            <Text style={styles.countdownSubtitle}>
              L'appel pour {selectedCreneau?.discipline} ({selectedCreneau?.categorie}) commencera à{' '}
              <Text style={{ fontWeight: '800', color: COLORS.primary }}>
                {selectedCreneau?.heureDebut}
              </Text>
            </Text>

            <View style={styles.timerRow}>
              <View style={styles.timerBlock}>
                <Text style={styles.timerNum}>{countdownFormatted.hh}</Text>
                <Text style={styles.timerUnit}>HEURES</Text>
              </View>
              <Text style={styles.timerColon}>:</Text>
              <View style={styles.timerBlock}>
                <Text style={styles.timerNum}>{countdownFormatted.mm}</Text>
                <Text style={styles.timerUnit}>MINUTES</Text>
              </View>
              <Text style={styles.timerColon}>:</Text>
              <View style={styles.timerBlock}>
                <Text style={styles.timerNum}>{countdownFormatted.ss}</Text>
                <Text style={styles.timerUnit}>SECONDES</Text>
              </View>
            </View>

            <View style={styles.countdownNotice}>
              <MaterialCommunityIcons name="lock-clock" size={16} color={COLORS.warning} />
              <Text style={styles.countdownNoticeText}>
                La saisie de l'appel se déverrouillera automatiquement dès {selectedCreneau?.heureDebut}.
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* Scope Filter & Search */}
          <View style={styles.filterRow}>
            <View style={styles.scopeSwitch}>
              <TouchableOpacity
                style={[styles.scopeBtn, scopeFilter === 'creneau' && styles.scopeBtnActive]}
                onPress={() => setScopeFilter('creneau')}
              >
                <MaterialCommunityIcons name="filter" size={14} color={scopeFilter === 'creneau' ? '#FFF' : COLORS.textMuted} />
                <Text style={[styles.scopeText, scopeFilter === 'creneau' && styles.scopeTextActive]}>Ce créneau</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scopeBtn, scopeFilter === 'tous' && styles.scopeBtnActive]}
                onPress={() => setScopeFilter('tous')}
              >
                <MaterialCommunityIcons name="account-group" size={14} color={scopeFilter === 'tous' ? '#FFF' : COLORS.textMuted} />
                <Text style={[styles.scopeText, scopeFilter === 'tous' && styles.scopeTextActive]}>Tous les adhérents</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un adhérent par nom ou code..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Stats Summary & Filter Bar */}
          <View style={styles.statsBar}>
            <TouchableOpacity
              style={[styles.statPill, statusFilter === 'tous' && styles.statPillActive]}
              onPress={() => setStatusFilter('tous')}
            >
              <Text style={[styles.statVal, { color: COLORS.textPrimary }]}>{statsSummary.total}</Text>
              <Text style={styles.statLbl}>Tous</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statPill, { backgroundColor: COLORS.success + '15' }, statusFilter === 'present' && styles.statPillActiveSuccess]}
              onPress={() => setStatusFilter('present')}
            >
              <Text style={[styles.statVal, { color: COLORS.success }, statusFilter === 'present' && { color: '#FFF' }]}>{statsSummary.presents}</Text>
              <Text style={[styles.statLbl, statusFilter === 'present' && { color: '#FFF' }]}>Présents</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statPill, { backgroundColor: COLORS.danger + '15' }, statusFilter === 'absent' && styles.statPillActiveDanger]}
              onPress={() => setStatusFilter('absent')}
            >
              <Text style={[styles.statVal, { color: COLORS.danger }, statusFilter === 'absent' && { color: '#FFF' }]}>{statsSummary.absents}</Text>
              <Text style={[styles.statLbl, statusFilter === 'absent' && { color: '#FFF' }]}>Absents</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statPill, { backgroundColor: COLORS.warning + '15' }, statusFilter === 'retard' && styles.statPillActiveWarning]}
              onPress={() => setStatusFilter('retard')}
            >
              <Text style={[styles.statVal, { color: COLORS.warning }, statusFilter === 'retard' && { color: '#FFF' }]}>{statsSummary.retards}</Text>
              <Text style={[styles.statLbl, statusFilter === 'retard' && { color: '#FFF' }]}>Retards</Text>
            </TouchableOpacity>
          </View>

          {/* Main List */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          >
            {filteredAdherents.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="account-search" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>Aucun adhérent dans cette liste</Text>
                <Text style={styles.emptyText}>
                  {statusFilter === 'tous'
                    ? `Aucun adhérent inscrit ne correspond à ce créneau.`
                    : `Aucun adhérent avec le statut "${statusFilter}" pour cette séance.`}
                </Text>
              </View>
            ) : (
              filteredAdherents.map(adherent => {
                const current = presenceMap[adherent.id] || { statut: 'present', remarque: '' };
                return (
                  <View key={adherent.id} style={styles.adherentCard}>
                    <View style={styles.cardHeader}>
                      <View style={styles.avatar}>
                        {adherent.photo ? (
                          <Image source={{ uri: adherent.photo }} style={styles.photo} />
                        ) : (
                          <View style={styles.photoPlaceholder}>
                            <Text style={styles.photoIcon}>👤</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.adherentInfo}>
                        <Text style={styles.adherentName}>{adherent.prenom} {adherent.nom}</Text>
                        <Text style={styles.adherentCode}>{adherent.code}</Text>
                      </View>
                      {current.statut === 'retard' && (
                        <View style={styles.retardBadge}>
                          <MaterialCommunityIcons name="clock-alert" size={12} color={COLORS.warning} />
                          <Text style={styles.retardBadgeText}>Retard (&gt;20 min)</Text>
                        </View>
                      )}
                    </View>

                    {/* Status Toggle Buttons - Seuls Présent et Absent */}
                    <View style={styles.statusRow}>
                      <TouchableOpacity
                        style={[
                          styles.statusBtn,
                          current.statut === 'present' && styles.btnPresent,
                          current.statut === 'retard' && styles.btnRetard,
                        ]}
                        onPress={() => handleStatutChange(adherent.id, 'present')}
                      >
                        <MaterialCommunityIcons
                          name={current.statut === 'retard' ? 'clock-alert' : 'check-circle'}
                          size={16}
                          color={['present', 'retard'].includes(current.statut) ? '#FFF' : (current.statut === 'retard' ? COLORS.warning : COLORS.success)}
                        />
                        <Text style={[styles.statusBtnText, ['present', 'retard'].includes(current.statut) && styles.textActive]}>
                          {current.statut === 'retard' ? 'Présent (Retard)' : 'Présent'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.statusBtn, current.statut === 'absent' && styles.btnAbsent]}
                        onPress={() => handleStatutChange(adherent.id, 'absent')}
                      >
                        <MaterialCommunityIcons name="close-circle" size={16} color={current.statut === 'absent' ? '#FFF' : COLORS.danger} />
                        <Text style={[styles.statusBtnText, current.statut === 'absent' && styles.textActive]}>Absent</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Optional Note input */}
                    <TextInput
                      style={styles.remarqueInput}
                      value={current.remarque}
                      onChangeText={(val) => handleRemarqueChange(adherent.id, val)}
                      placeholder="Remarque (ex: Arrivé à 18h15, Justificatif médical)"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer Save Button */}
          {adherents.length > 0 && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveBtn, (isFuture || isNotStartedYet) && { backgroundColor: COLORS.textMuted }]}
                onPress={handleSave}
                disabled={saving || isFuture || isNotStartedYet}
              >
                <MaterialCommunityIcons name={isFuture || isNotStartedYet ? 'cancel' : 'content-save'} size={20} color="#FFF" />
                <Text style={styles.saveBtnText}>
                  {isFuture
                    ? 'Date future (Saisie interdite)'
                    : isNotStartedYet
                    ? 'Créneau non débuté'
                    : saving
                    ? 'Enregistrement...'
                    : 'Enregistrer la séance'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  selectorSection: {
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  noSlotToday: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noSlotTodayText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  creneauScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  creneauChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  creneauChipSelected: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  creneauChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  creneauChipTextSelected: { color: COLORS.primary },
  creneauChipCat: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },

  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dateControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateNavBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  todayBtn: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  todayText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateInput: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 95,
  },
  dateShortcuts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shortcutChip: {
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  shortcutChipActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  shortcutText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  shortcutTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scopeSwitch: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  scopeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  scopeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  scopeTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13,
    padding: 0,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.success + '30',
  },
  markAllText: { color: COLORS.success, fontSize: 12, fontWeight: '700' },

  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statPillActiveSuccess: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  statPillActiveDanger: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  statPillActiveWarning: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },
  statPillActiveSecondary: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  statVal: { fontSize: 14, fontWeight: '800' },
  statLbl: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },

  emptyContainer: {
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 30,
    gap: 12,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },

  adherentCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: { width: 44, height: 44 },
  photo: { width: 44, height: 44, borderRadius: 22 },
  photoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIcon: { fontSize: 20 },
  adherentInfo: { flex: 1 },
  adherentName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  adherentCode: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  retardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warning + '20',
    borderColor: COLORS.warning,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  retardBadgeText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '800',
  },

  statusRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusBtnText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  textActive: { color: '#FFF' },
  btnPresent: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  btnAbsent: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  btnRetard: { backgroundColor: COLORS.warning, borderColor: COLORS.warning },
  btnExcuse: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },

  remarqueInput: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: COLORS.textPrimary,
    fontSize: 12,
  },

  footer: {
    padding: 16,
    backgroundColor: COLORS.bgCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },

  futureWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.danger + '15',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '40',
  },
  futureWarningText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  countdownContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownCard: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    ...SHADOWS.card,
  },
  countdownIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  countdownTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  countdownSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 8,
  },
  timerBlock: {
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    minWidth: 72,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timerNum: {
    color: COLORS.primary,
    fontSize: 26,
    fontWeight: '900',
  },
  timerUnit: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  timerColon: {
    color: COLORS.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  countdownNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warning + '15',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },
  countdownNoticeText: {
    flex: 1,
    color: COLORS.warning,
    fontSize: 12,
    fontWeight: '600',
  },
});
