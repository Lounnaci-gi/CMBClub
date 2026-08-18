// src/screens/admin/PresencesScreen.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, RefreshControl, Image, StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { CATEGORIES, getEffectiveCategory } from '../../utils/categories';
import QrAttendanceScannerModal from '../../components/QrAttendanceScannerModal';
import {
  JOURS_FR,
  JOURS_SEMAINE,
  getTodayJour,
  getLocalDateString,
  getCurrentTimeString,
  isLateBy20Min,
  getSlotStartDateTime,
  getDateForJour,
  getNextOccurrenceDateTime,
  getSlotStatus,
  findActiveOrUpcomingSlotToday,
} from '../../utils/creneaux';
import { printPresencesSeance } from '../../utils/printPresencesSeance';
import { getNotifAbsencesForCreneau, markNotifAbsenceLue } from '../../database/database';

export default function PresencesScreen({ route, navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const {
    creneaux, adherents: storeAdherents, saisonActive, config,
    loadCreneaux, loadSaisons, loadAdherents, loadConfig,
    getEligibleAdherents, getPresencesSeance, savePresencesSeance,
  } = useStore();

  const initialCreneauId = route?.params?.creneauId || null;
  const initialDateSeance = route?.params?.dateSeance || getLocalDateString();

  const [now, setNow] = useState(new Date());
  const todayJour = useMemo(() => getTodayJour(now), [now]);

  // Selected state
  const [selectedJour, setSelectedJour] = useState(todayJour);
  const [selectedCreneauId, setSelectedCreneauId] = useState(initialCreneauId);
  const [dateSeance, setDateSeance] = useState(initialDateSeance);
  const [statusFilter, setStatusFilter] = useState('tous'); // 'tous' | 'present' | 'absent' | 'retard' | 'non_pointe'
  const [scopeFilter, setScopeFilter] = useState('creneau'); // 'creneau' | 'tous'
  const [searchQuery, setSearchQuery] = useState('');
  const [adherents, setAdherents] = useState([]);
  const [presenceMap, setPresenceMap] = useState({}); // adherentId -> { statut, remarque }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [notifAbsences, setNotifAbsences]       = useState([]); // notifications d'absence adhérents
  const [showNotifs, setShowNotifs]             = useState(false);

  // Synchronise selectedJour si un initialCreneauId est reçu
  useEffect(() => {
    if (initialCreneauId && creneaux && creneaux.length > 0) {
      const found = creneaux.find(c => c.id === initialCreneauId);
      if (found && found.jour) {
        setSelectedJour(found.jour);
        setSelectedCreneauId(found.id);
      }
    }
  }, [initialCreneauId, creneaux]);

  // Créneaux visibles pour le jour sélectionné
  const visibleSlots = useMemo(() => {
    return (creneaux || []).filter(c => c.jour === selectedJour);
  }, [creneaux, selectedJour]);

  // Créneau actuellement sélectionné
  const selectedCreneau = useMemo(() => {
    if (selectedCreneauId) {
      const found = (creneaux || []).find(c => c.id === selectedCreneauId);
      if (found) return found;
    }
    return null;
  }, [creneaux, selectedCreneauId]);

  // Statut du créneau sélectionné : 'ongoing' | 'upcoming' | 'ended' | 'not_today'
  const slotStatus = useMemo(() => {
    if (!selectedCreneau) return null;
    return getSlotStatus(selectedCreneau, now);
  }, [selectedCreneau, now]);

  const isBlocked = slotStatus === 'upcoming' || slotStatus === 'ended' || slotStatus === 'not_today';

  // Cible du compte à rebours :
  const countdownTarget = useMemo(() => {
    if (!selectedCreneau?.heureDebut || !selectedCreneau?.jour || !isBlocked) return null;
    if (slotStatus === 'upcoming') {
      return getSlotStartDateTime(getLocalDateString(), selectedCreneau.heureDebut);
    }
    if (slotStatus === 'ended' || slotStatus === 'not_today') {
      return getNextOccurrenceDateTime(selectedCreneau.jour, selectedCreneau.heureDebut);
    }
    return null;
  }, [slotStatus, isBlocked, selectedCreneau?.heureDebut, selectedCreneau?.jour]);

  // Horloge de rafraîchissement
  useEffect(() => {
    const interval = isBlocked ? 1000 : 30000;
    const timer = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(timer);
  }, [isBlocked]);

  const countdownFormatted = useMemo(() => {
    if (!countdownTarget || !isBlocked) return null;
    const diffMs = countdownTarget.getTime() - now.getTime();
    if (diffMs <= 0) return null;
    const totalSec = Math.floor(diffMs / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return { hh, mm, ss };
  }, [countdownTarget, now, isBlocked]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let currentCreneaux = creneaux;
      let currentSaison = saisonActive;

      if (!currentCreneaux || currentCreneaux.length === 0) {
        currentCreneaux = await loadCreneaux();
      }
      if (!currentSaison) {
        currentSaison = await loadSaisons();
      }
      if (loadAdherents) {
        await loadAdherents();
      }
      if (loadConfig && !config) {
        await loadConfig();
      }

      // 1. Si un créneau spécifique est déjà sélectionné
      let targetCreneau = null;
      if (selectedCreneauId) {
        targetCreneau = (currentCreneaux || []).find(c => c.id === selectedCreneauId) || null;
      }

      // 2. Sinon, auto-sélection intelligente pour aujourd'hui
      if (!targetCreneau && !initialCreneauId) {
        const resolution = findActiveOrUpcomingSlotToday(currentCreneaux || [], new Date());
        if (resolution.slot) {
          targetCreneau = resolution.slot;
          setSelectedCreneauId(resolution.slot.id);
          setSelectedJour(resolution.todayJour);
        }
      }

      if (!targetCreneau) {
        setAdherents([]);
        setPresenceMap({});
        setIsSaved(false);
        setHasUnsavedChanges(false);
        return;
      }

      const eligible = await getEligibleAdherents(targetCreneau.id, currentSaison?.id);
      setAdherents(eligible);

      const existing = await getPresencesSeance(targetCreneau.id, dateSeance);
      const map = {};
      const hasSavedRecords = existing && existing.length > 0;

      eligible.forEach(a => {
        const found = existing.find(p => p.adherentId === a.id);
        if (found) {
          map[a.id] = { statut: found.statut, remarque: found.remarque || '' };
        } else {
          // Statut null par défaut au début tant qu'il n'est pas pointé
          map[a.id] = { statut: null, remarque: '' };
        }
      });

      setPresenceMap(map);
      setIsSaved(hasSavedRecords);
      setHasUnsavedChanges(false);

      // Charger les notifications d'absence des adhérents pour ce créneau/date
      try {
        const notifs = await getNotifAbsencesForCreneau(targetCreneau.id, dateSeance);
        setNotifAbsences(notifs || []);
      } catch (_e) {
        setNotifAbsences([]);
      }
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de charger les présences.');
    } finally {
      setLoading(false);
    }
  }, [selectedCreneauId, initialCreneauId, dateSeance, getEligibleAdherents, getPresencesSeance, loadCreneaux, loadSaisons, loadAdherents, loadConfig, config]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSelectDay = (day) => {
    setSelectedJour(day);
    setDateSeance(getDateForJour(day));
    const daySlots = (creneaux || []).filter(c => c.jour === day);
    if (daySlots.length > 0) {
      if (day === todayJour) {
        const res = findActiveOrUpcomingSlotToday(creneaux, new Date());
        if (res.slot) {
          setSelectedCreneauId(res.slot.id);
          return;
        }
      }
      setSelectedCreneauId(daySlots[0].id);
    } else {
      setSelectedCreneauId(null);
    }
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
    setSelectedJour(todayJour);
    const res = findActiveOrUpcomingSlotToday(creneaux, new Date());
    if (res.slot) {
      setSelectedCreneauId(res.slot.id);
    }
  };

  const handleYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setDateSeance(getLocalDateString(d));
    setSelectedJour(JOURS_FR[d.getDay()]);
  };

  const handleStatutChange = (adherentId, targetStatut) => {
    if (isBlocked) {
      Alert.alert(
        slotStatus === 'ended' || slotStatus === 'not_today' ? 'Créneau terminé' : 'Créneau non débuté',
        slotStatus === 'ended' || slotStatus === 'not_today'
          ? 'Ce créneau est terminé. L\'appel n\'est plus disponible.'
          : 'L\'appel est bloqué jusqu\'au début du créneau.'
      );
      return;
    }
    const currentNow = new Date();
    const timeStr = getCurrentTimeString(currentNow);
    const startStr = selectedCreneau?.heureDebut;
    const isLate = isLateBy20Min(startStr, currentNow);

    setPresenceMap(prev => {
      const currentEntry = prev[adherentId] || { statut: null, remarque: '' };
      let finalStatut = targetStatut;
      let autoText = '';

      // Si on reclique sur le statut déjà actif, on le désélectionne (remise à null)
      if (currentEntry.statut === targetStatut || (targetStatut === 'present' && currentEntry.statut === 'retard')) {
        finalStatut = null;
        autoText = '';
      } else if (targetStatut === 'present') {
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

      let newRemarque = autoText;
      const existingRemarque = currentEntry.remarque || '';
      if (existingRemarque && !/^(Présent à|Absent \(|Retard \()/i.test(existingRemarque)) {
        newRemarque = autoText ? `${autoText} - ${existingRemarque}` : existingRemarque;
      }

      return {
        ...prev,
        [adherentId]: {
          statut: finalStatut,
          remarque: newRemarque,
        },
      };
    });

    setIsSaved(false);
    setHasUnsavedChanges(true);
  };

  const handleRemarqueChange = (adherentId, remarque) => {
    setPresenceMap(prev => ({
      ...prev,
      [adherentId]: { ...(prev[adherentId] || { statut: null }), remarque },
    }));
    setIsSaved(false);
    setHasUnsavedChanges(true);
  };

  const handleMarkAllPresent = () => {
    if (isBlocked) {
      Alert.alert(
        slotStatus === 'ended' || slotStatus === 'not_today' ? 'Créneau terminé' : 'Créneau non débuté',
        slotStatus === 'ended' || slotStatus === 'not_today'
          ? 'Ce créneau est terminé. L\'appel n\'est plus disponible.'
          : 'L\'appel est bloqué jusqu\'au début du créneau.'
      );
      return;
    }
    const currentNow = new Date();
    const timeStr = getCurrentTimeString(currentNow);
    const startStr = selectedCreneau?.heureDebut;
    const isLate = isLateBy20Min(startStr, currentNow);
    const finalStatut = isLate ? 'retard' : 'present';
    const autoText = isLate ? `Retard (${timeStr} - >20 min créneau ${startStr || ''})` : `Présent à ${timeStr}`;

    setPresenceMap(prev => {
      const nextMap = { ...prev };
      adherents.forEach(a => {
        const existingRemarque = nextMap[a.id]?.remarque || '';
        let newRemarque = autoText;
        if (existingRemarque && !/^(Présent à|Absent \(|Retard \()/i.test(existingRemarque)) {
          newRemarque = `${autoText} - ${existingRemarque}`;
        }
        nextMap[a.id] = {
          statut: finalStatut,
          remarque: newRemarque,
        };
      });
      return nextMap;
    });

    setIsSaved(false);
    setHasUnsavedChanges(true);
  };

  const handleQrAdherentScanned = (adherent) => {
    if (isBlocked) {
      return {
        statutText: slotStatus === 'ended' || slotStatus === 'not_today' ? 'Créneau terminé' : 'Créneau non débuté',
        timeStr: '',
      };
    }
    const currentNow = new Date();
    const timeStr = getCurrentTimeString(currentNow);
    const startStr = selectedCreneau?.heureDebut;
    const isLate = isLateBy20Min(startStr, currentNow);
    const finalStatut = isLate ? 'retard' : 'present';
    const autoText = isLate
      ? `Retard (${timeStr} - >20 min créneau ${startStr || ''} · QR Scan)`
      : `Présent à ${timeStr} (QR Scan)`;

    setAdherents(prev => {
      if (prev.some(a => a.id === adherent.id)) return prev;
      return [...prev, adherent];
    });

    setPresenceMap(prev => {
      const existingRemarque = prev[adherent.id]?.remarque || '';
      let newRemarque = autoText;
      if (existingRemarque && !/^(Présent à|Absent \(|Retard \()/i.test(existingRemarque)) {
        newRemarque = `${autoText} - ${existingRemarque}`;
      }
      return {
        ...prev,
        [adherent.id]: {
          statut: finalStatut,
          remarque: newRemarque,
        },
      };
    });

    setIsSaved(false);
    setHasUnsavedChanges(true);

    return {
      statutText: isLate ? 'Retard ⏰ (>20 min)' : 'Présent ✅',
      timeStr,
    };
  };

  const handleSave = async () => {
    if (isBlocked) {
      Alert.alert(
        slotStatus === 'ended' || slotStatus === 'not_today' ? 'Créneau terminé' : 'Créneau non débuté',
        slotStatus === 'ended' || slotStatus === 'not_today'
          ? 'Ce créneau est terminé. L\'appel n\'est plus disponible.'
          : 'L\'appel est bloqué jusqu\'au début du créneau.'
      );
      return;
    }
    if (!saisonActive) {
      Alert.alert('Saison requise', 'Impossible d’enregistrer : aucune saison active n’est ouverte.');
      return;
    }
    if (!selectedCreneau) return;

    setSaving(true);
    try {
      const presencesToSave = adherents
        .map(a => ({
          adherentId: a.id,
          statut: presenceMap[a.id]?.statut || null,
          remarque: presenceMap[a.id]?.remarque || null,
        }))
        .filter(p => p.statut !== null);

      if (presencesToSave.length === 0) {
        Alert.alert('Pointage requis', 'Veuillez pointer au moins un adhérent (Présent ou Absent) avant d’enregistrer.');
        setSaving(false);
        return;
      }

      await savePresencesSeance(selectedCreneau.id, dateSeance, saisonActive.id, presencesToSave);
      setIsSaved(true);
      setHasUnsavedChanges(false);
      Alert.alert('Succès', 'Présences de la séance enregistrées avec succès ! Vous pouvez maintenant imprimer la feuille d’appel.');
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d’enregistrer les présences.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedCreneau) {
      Alert.alert('Erreur', 'Veuillez sélectionner un créneau à imprimer.');
      return;
    }

    if (!isSaved || hasUnsavedChanges) {
      Alert.alert(
        'Enregistrement requis',
        'Vous devez d’abord enregistrer l’appel de la séance avant de pouvoir imprimer la feuille d’appel.',
        [
          { text: 'Enregistrer maintenant', onPress: handleSave },
          { text: 'Annuler', style: 'cancel' },
        ]
      );
      return;
    }

    const adherentsToPrint = filteredAdherents.length > 0 ? filteredAdherents : adherents;
    setPrinting(true);
    try {
      await printPresencesSeance({
        creneau: selectedCreneau,
        dateSeance,
        saison: saisonActive,
        adherents: adherentsToPrint,
        presenceMap,
        config: config || {},
      });
    } finally {
      setPrinting(false);
    }
  };

  // Filtrage des adhérents
  const filteredAdherents = useMemo(() => {
    const listToFilter = scopeFilter === 'tous' ? (storeAdherents && storeAdherents.length > 0 ? storeAdherents : adherents) : adherents;
    return listToFilter.filter(a => {
      const p = presenceMap[a.id];

      let matchesStatus = true;
      if (statusFilter !== 'tous') {
        if (statusFilter === 'non_pointe') {
          matchesStatus = !p || p.statut === null;
        } else {
          matchesStatus = p?.statut === statusFilter;
        }
      }

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (a.nom || '').toLowerCase().includes(q) ||
        (a.prenom || '').toLowerCase().includes(q) ||
        (a.code || '').toLowerCase().includes(q);

      let matchesScope = true;
      if (scopeFilter === 'creneau' && selectedCreneau) {
        const creneauDiscip = (selectedCreneau.discipline || '').trim().toLowerCase();
        const creneauCatList = (selectedCreneau.categorie || '')
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);

        const adhDiscip = (a.discipline || '').trim().toLowerCase();
        const matchDisc = !adhDiscip ||
          !creneauDiscip ||
          creneauDiscip.includes('tout') ||
          adhDiscip.includes(creneauDiscip) ||
          creneauDiscip.includes(adhDiscip);

        const catObj = getEffectiveCategory(a);
        const catLabel = (catObj?.label || '').trim().toLowerCase();
        const matchCat = creneauCatList.length === 0 ||
          creneauCatList.includes('tout') ||
          creneauCatList.includes('toutes') ||
          creneauCatList.includes(catLabel);

        matchesScope = matchDisc && matchCat;
      }

      return matchesStatus && matchesSearch && matchesScope;
    });
  }, [adherents, storeAdherents, presenceMap, statusFilter, searchQuery, scopeFilter, selectedCreneau]);

  const statsSummary = useMemo(() => {
    let presents = 0, absents = 0, retards = 0, nonPointes = 0;
    filteredAdherents.forEach(a => {
      const p = presenceMap[a.id];
      if (p?.statut === 'present') presents++;
      else if (p?.statut === 'retard') retards++;
      else if (p?.statut === 'absent') absents++;
      else nonPointes++;
    });
    return { total: filteredAdherents.length, presents, absents, retards, nonPointes };
  }, [presenceMap, filteredAdherents]);

  const todayStr = getLocalDateString();
  const isToday = dateSeance === todayStr;
  const isFuture = dateSeance > todayStr;
  const noOpenSeason = !saisonActive;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {noOpenSeason && (
        <View style={styles.futureWarningBox}>
          <MaterialCommunityIcons name="lock" size={20} color={COLORS.danger} />
          <Text style={styles.futureWarningText}>Aucune saison ouverte : la gestion des absences est indisponible.</Text>
        </View>
      )}

      {/* Sélecteur de jour de la semaine */}
      <View style={styles.daySelectorSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jourScroll}>
          {JOURS_SEMAINE.map(j => {
            const isSelected = j === selectedJour;
            const isTodayDay = j === todayJour;
            return (
              <TouchableOpacity
                key={j}
                style={[
                  styles.jourChip,
                  isSelected && styles.jourChipActive,
                  isTodayDay && !isSelected && styles.jourChipToday,
                ]}
                onPress={() => handleSelectDay(j)}
              >
                <Text style={[
                  styles.jourChipText,
                  isSelected && styles.jourChipTextActive,
                  isTodayDay && !isSelected && { color: COLORS.primary },
                ]}>
                  {j} {isTodayDay ? '•' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Section des Créneaux du jour */}
      <View style={styles.selectorSection}>
        <View style={styles.selectorHeader}>
          <MaterialCommunityIcons name="calendar-clock" size={14} color={COLORS.primary} />
          <Text style={styles.sectionLabel}>
            Créneaux du {selectedJour} ({visibleSlots.length}) :
          </Text>
        </View>

        {visibleSlots.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creneauScroll}>
            {visibleSlots.map(c => {
              const isSelected = c.id === selectedCreneau?.id;
              const status = getSlotStatus(c, now);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.creneauChip, isSelected && styles.creneauChipSelected]}
                  onPress={() => {
                    setSelectedCreneauId(c.id);
                    if (c.jour) {
                      setDateSeance(getDateForJour(c.jour));
                    }
                  }}
                >
                  <View style={styles.creneauChipHeader}>
                    <Text style={[styles.creneauChipText, isSelected && styles.creneauChipTextSelected]}>
                      {c.discipline} · {c.heureDebut}
                    </Text>
                    {status === 'ongoing' && (
                      <View style={styles.slotBadgeOngoing}>
                        <Text style={styles.slotBadgeOngoingText}>En cours</Text>
                      </View>
                    )}
                    {status === 'upcoming' && (
                      <View style={styles.slotBadgeUpcoming}>
                        <Text style={styles.slotBadgeUpcomingText}>À venir</Text>
                      </View>
                    )}
                    {status === 'ended' && (
                      <View style={styles.slotBadgeEnded}>
                        <Text style={styles.slotBadgeEndedText}>Terminé</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.creneauChipCat, isSelected && { color: COLORS.primary }]}>
                    {c.categorie}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* État vide : Aucun créneau programmé ou aucun créneau sélectionné */}
      {visibleSlots.length === 0 ? (
        <View style={styles.emptySlotCard}>
          <View style={styles.emptySlotIconBg}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={42} color={COLORS.textMuted} />
          </View>
          <Text style={styles.emptySlotTitle}>
            {selectedJour === todayJour ? "Aucun créneau aujourd'hui" : `Aucun créneau le ${selectedJour}`}
          </Text>
          <Text style={styles.emptySlotSubtitle}>
            {selectedJour === todayJour
              ? `Il n'y a aucun créneau d'entraînement programmé pour aujourd'hui (${selectedJour}).`
              : `Aucun créneau d'entraînement n'est programmé le ${selectedJour}.`}
          </Text>
          {navigation && (
            <TouchableOpacity
              style={styles.emptySlotPrimaryBtn}
              onPress={() => navigation.navigate('Creneaux')}
            >
              <MaterialCommunityIcons name="calendar-clock" size={18} color="#FFF" />
              <Text style={styles.emptySlotPrimaryBtnText}>Consulter le planning</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : !selectedCreneau ? (
        <View style={styles.emptySlotCard}>
          <View style={styles.emptySlotIconBg}>
            <MaterialCommunityIcons name="gesture-tap" size={42} color={COLORS.primary} />
          </View>
          <Text style={styles.emptySlotTitle}>Sélectionnez un créneau</Text>
          <Text style={styles.emptySlotSubtitle}>
            Veuillez choisir l'un des créneaux du {selectedJour} ci-dessus pour faire l'appel.
          </Text>
        </View>
      ) : (
        <>
          {/* Date & Raccourcis */}
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

            {/* Presets rapides de date */}
            <View style={styles.dateShortcuts}>
              <TouchableOpacity onPress={handleYesterday} style={styles.shortcutChip}>
                <Text style={styles.shortcutText}>Hier</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleToday} style={[styles.shortcutChip, isToday && styles.shortcutChipActive]}>
                <Text style={[styles.shortcutText, isToday && styles.shortcutTextActive]}>Auj.</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.markAllBtn, (isFuture || isBlocked || noOpenSeason) && { opacity: 0.5 }]}
              onPress={handleMarkAllPresent}
              disabled={isFuture || isBlocked || noOpenSeason}
            >
              <MaterialCommunityIcons name="check-all" size={16} color={COLORS.success} />
              <Text style={styles.markAllText}>Tout présent</Text>
            </TouchableOpacity>
          </View>

          {/* Warning Banner if Future Date */}
          {isFuture && (
            <View style={styles.futureWarningBox}>
              <MaterialCommunityIcons name="alert-decagram" size={18} color={COLORS.danger} />
              <Text style={styles.futureWarningText}>
                Saisie interdite : La date sélectionnée ({dateSeance}) est dans le futur.
              </Text>
            </View>
          )}

          {/* Affichage du chrono si le créneau n'a pas encore débuté ou est terminé */}
          {isBlocked && countdownFormatted ? (
            <View style={styles.countdownContainer}>
              <View style={styles.countdownCard}>
                <View style={styles.countdownIconBg}>
                  <MaterialCommunityIcons
                    name={slotStatus === 'ended' || slotStatus === 'not_today' ? 'clock-end' : 'clock-start'}
                    size={40}
                    color={slotStatus === 'ended' || slotStatus === 'not_today' ? COLORS.danger : COLORS.primary}
                  />
                </View>
                <Text style={[styles.countdownTitle, (slotStatus === 'ended' || slotStatus === 'not_today') && { color: COLORS.danger }]}>
                  {slotStatus === 'ended' || slotStatus === 'not_today' ? 'Créneau terminé' : 'Créneau non débuté'}
                </Text>
                <Text style={styles.countdownSubtitle}>
                  {slotStatus === 'ended' || slotStatus === 'not_today' ? (
                    <>Le créneau{' '}
                      <Text style={{ fontWeight: '800', color: COLORS.textPrimary }}>
                        {selectedCreneau?.discipline} ({selectedCreneau?.categorie})
                      </Text>{' '}
                      du <Text style={{ fontWeight: '700', color: COLORS.secondary }}>{selectedCreneau?.jour}</Text>{' '}
                      est terminé. Prochain créneau dans :
                    </>
                  ) : (
                    <>L’appel pour le créneau{' '}
                      <Text style={{ fontWeight: '800', color: COLORS.textPrimary }}>
                        {selectedCreneau?.discipline} ({selectedCreneau?.categorie})
                      </Text>{' '}
                      du <Text style={{ fontWeight: '700', color: COLORS.secondary }}>{selectedCreneau?.jour}</Text>{' '}
                      à{' '}
                      <Text style={{ fontWeight: '800', color: COLORS.primary }}>
                        {selectedCreneau?.heureDebut}
                      </Text>{' '}
                      commencera dans :
                    </>
                  )}
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
                    {slotStatus === 'ended' || slotStatus === 'not_today'
                      ? `L’appel reprend à ${selectedCreneau?.heureDebut} lors du prochain ${selectedCreneau?.jour}.`
                      : `La saisie se déverrouille automatiquement dès ${selectedCreneau?.heureDebut}.`}
                  </Text>
                </View>

                {/* Bouton d'impression lorsque le créneau est terminé */}
                <TouchableOpacity
                  style={[
                    styles.countdownPrintBtn,
                    (!isSaved || hasUnsavedChanges) && styles.countdownPrintBtnUnsaved,
                  ]}
                  onPress={handlePrint}
                  disabled={printing}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={!isSaved || hasUnsavedChanges ? "printer-alert" : "printer"}
                    size={18}
                    color="#FFF"
                  />
                  <Text style={styles.countdownPrintBtnText}>
                    {printing ? 'Génération du document...' : 'Imprimer la feuille d’appel'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Action Toolbar with Scope switch, QR Scanner and Print Button */}
              <View style={styles.actionToolbar}>
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

                {/* QR Scan Action Button */}
                <TouchableOpacity
                  style={[styles.qrScanBtn, (isFuture || noOpenSeason) && { opacity: 0.5 }]}
                  onPress={() => setQrScannerVisible(true)}
                  disabled={isFuture || noOpenSeason}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="qrcode-scan" size={16} color="#FFF" />
                  <Text style={styles.qrScanBtnText}>Scanner QR</Text>
                </TouchableOpacity>

                {/* Print Action Button */}
                <TouchableOpacity
                  style={[
                    styles.printBtn,
                    (!isSaved || hasUnsavedChanges) && styles.printBtnUnsaved,
                    printing && { opacity: 0.6 },
                  ]}
                  onPress={handlePrint}
                  disabled={printing}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={!isSaved || hasUnsavedChanges ? "printer-alert" : "printer"}
                    size={16}
                    color="#FFF"
                  />
                  <Text style={styles.printBtnText}>{printing ? '...' : 'Imprimer'}</Text>
                </TouchableOpacity>
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

              {/* ── Panneau notifications d'absence adhérents ── */}
              {notifAbsences.length > 0 && (
                <View style={styles.notifAbsencePanel}>
                  <TouchableOpacity
                    style={styles.notifAbsenceHeader}
                    onPress={() => setShowNotifs(!showNotifs)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.notifAbsenceLeft}>
                      <View style={styles.notifAbsenceBadge}>
                        <Text style={styles.notifAbsenceBadgeText}>{notifAbsences.length}</Text>
                      </View>
                      <MaterialCommunityIcons name="bell-alert-outline" size={16} color={COLORS.warning} />
                      <Text style={styles.notifAbsenceTitle}>
                        {notifAbsences.length} signalement{notifAbsences.length > 1 ? 's' : ''} d'absence
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={showNotifs ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.textMuted}
                    />
                  </TouchableOpacity>

                  {showNotifs && (
                    <View style={styles.notifAbsenceList}>
                      {notifAbsences.map(n => (
                        <View key={n.id} style={[styles.notifAbsenceItem, n.lu === 1 && styles.notifAbsenceItemLu]}>
                          <View style={styles.notifAbsenceItemLeft}>
                            <View style={styles.notifAbsenceAvatar}>
                              <Text style={{ fontSize: 16 }}>🔔</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.notifAbsenceName}>
                                {n.prenom} {n.nom}
                                <Text style={styles.notifAbsenceCode}> · {n.code}</Text>
                              </Text>
                              {n.message ? (
                                <Text style={styles.notifAbsenceMessage}>"{n.message}"</Text>
                              ) : (
                                <Text style={styles.notifAbsenceNoMsg}>Absence signalée sans motif</Text>
                              )}
                            </View>
                          </View>
                          {n.lu === 0 && (
                            <TouchableOpacity
                              style={styles.notifAbsenceLuBtn}
                              onPress={async () => {
                                await markNotifAbsenceLue(n.id);
                                setNotifAbsences(prev =>
                                  prev.map(x => x.id === n.id ? { ...x, lu: 1 } : x)
                                );
                              }}
                            >
                              <MaterialCommunityIcons name="check" size={14} color={COLORS.success} />
                            </TouchableOpacity>
                          )}
                          {n.lu === 1 && (
                            <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.success} />
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

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

                {statsSummary.nonPointes > 0 && (
                  <TouchableOpacity
                    style={[styles.statPill, { backgroundColor: COLORS.textMuted + '15' }, statusFilter === 'non_pointe' && styles.statPillActiveMuted]}
                    onPress={() => setStatusFilter('non_pointe')}
                  >
                    <Text style={[styles.statVal, { color: COLORS.textMuted }, statusFilter === 'non_pointe' && { color: '#FFF' }]}>{statsSummary.nonPointes}</Text>
                    <Text style={[styles.statLbl, statusFilter === 'non_pointe' && { color: '#FFF' }]}>En attente</Text>
                  </TouchableOpacity>
                )}
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
                        : statusFilter === 'non_pointe'
                        ? `Tous les adhérents ont déjà été pointés pour cette séance.`
                        : `Aucun adhérent avec le statut "${statusFilter}" pour cette séance.`}
                    </Text>
                  </View>
                ) : (
                  filteredAdherents.map(adherent => {
                    const current = presenceMap[adherent.id] || { statut: null, remarque: '' };
                    const notif = notifAbsences.find(n => n.adherentId === adherent.id);
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
                          {current.statut === null && (
                            <View style={styles.nonPointeBadge}>
                              <Text style={styles.nonPointeBadgeText}>En attente</Text>
                            </View>
                          )}
                        </View>

                        {/* Badge de signalement d'absence si présent */}
                        {notif && (
                          <View style={styles.adherentNotifBadge}>
                            <MaterialCommunityIcons name="bell-alert" size={13} color={COLORS.warning} />
                            <Text style={styles.adherentNotifText}>
                              Absence signalée {notif.message ? `: "${notif.message}"` : ''}
                            </Text>
                          </View>
                        )}

                        {/* Status Toggle Buttons */}
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

                        {/* Note input */}
                        <TextInput
                          style={styles.remarqueInput}
                          value={current.remarque || ''}
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
                    style={[
                      styles.saveBtn,
                      (isFuture || isBlocked || noOpenSeason) && { backgroundColor: COLORS.textMuted },
                      isSaved && !hasUnsavedChanges && { backgroundColor: COLORS.success },
                    ]}
                    onPress={handleSave}
                    disabled={saving || isFuture || isBlocked || noOpenSeason}
                  >
                    <MaterialCommunityIcons
                      name={isFuture || isBlocked ? 'cancel' : isSaved && !hasUnsavedChanges ? 'check-circle' : 'content-save'}
                      size={20}
                      color="#FFF"
                    />
                    <Text style={styles.saveBtnText}>
                      {noOpenSeason
                        ? 'Saison ouverte requise'
                        : isFuture
                        ? 'Date future (Saisie interdite)'
                        : slotStatus === 'ended' || slotStatus === 'not_today'
                        ? 'Créneau terminé'
                        : slotStatus === 'upcoming'
                        ? 'Créneau non débuté'
                        : saving
                        ? 'Enregistrement...'
                        : isSaved && !hasUnsavedChanges
                        ? 'Séance enregistrée ✓'
                        : 'Enregistrer la séance'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </>
      )}

      {/* QR Code Attendance Scanner Modal */}
      <QrAttendanceScannerModal
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        allAdherents={storeAdherents && storeAdherents.length > 0 ? storeAdherents : adherents}
        onAdherentScanned={handleQrAdherentScanned}
        selectedCreneau={selectedCreneau}
      />
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  daySelectorSection: {
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  jourScroll: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  jourChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  jourChipActive: {
    backgroundColor: COLORS.primary + '25',
    borderColor: COLORS.primary,
  },
  jourChipToday: {
    borderColor: COLORS.primary + '60',
  },
  jourChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  jourChipTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },

  selectorSection: {
    paddingTop: 10,
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
  creneauChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creneauChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  creneauChipTextSelected: { color: COLORS.primary },
  creneauChipCat: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  slotBadgeOngoing: {
    backgroundColor: COLORS.success + '25',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotBadgeOngoingText: {
    color: COLORS.success,
    fontSize: 9,
    fontWeight: '800',
  },
  slotBadgeUpcoming: {
    backgroundColor: COLORS.warning + '25',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotBadgeUpcomingText: {
    color: COLORS.warning,
    fontSize: 9,
    fontWeight: '800',
  },
  slotBadgeEnded: {
    backgroundColor: COLORS.textMuted + '25',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotBadgeEndedText: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },

  emptySlotCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    margin: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...SHADOWS.card,
  },
  emptySlotIconBg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptySlotTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySlotSubtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  emptySlotPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    marginTop: 6,
    ...SHADOWS.button,
  },
  emptySlotPrimaryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },

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
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateInput: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    padding: 0,
    width: 85,
  },
  dateShortcuts: {
    flexDirection: 'row',
    gap: 6,
  },
  shortcutChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgInput,
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
    fontWeight: '700',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.success + '30',
  },
  markAllText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '700',
  },

  actionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  scopeSwitch: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.bgInput,
    padding: 3,
    borderRadius: RADIUS.md,
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
    fontSize: 11,
    fontWeight: '600',
  },
  scopeTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  qrScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    ...SHADOWS.button,
  },
  qrScanBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    ...SHADOWS.button,
  },
  printBtnUnsaved: {
    backgroundColor: '#64748B',
  },
  printBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
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

  statsBar: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statPillActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '20',
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
  statPillActiveMuted: {
    backgroundColor: COLORS.textMuted,
    borderColor: COLORS.textMuted,
  },
  statVal: { fontSize: 15, fontWeight: '800' },
  statLbl: { color: COLORS.textMuted, fontSize: 9.5, fontWeight: '600', marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 },

  emptyContainer: {
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 30,
    gap: 12,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },

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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIcon: { fontSize: 20 },
  adherentInfo: { flex: 1 },
  adherentName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  adherentCode: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  retardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  retardBadgeText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  nonPointeBadge: {
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nonPointeBadgeText: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '600',
  },

  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusBtnText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  btnPresent: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  btnRetard: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },
  btnAbsent: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  textActive: { color: '#FFF', fontWeight: '800' },

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
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  countdownPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    marginTop: 6,
    width: '100%',
    ...SHADOWS.button,
  },
  countdownPrintBtnUnsaved: {
    backgroundColor: '#64748B',
  },
  countdownPrintBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },

  /* Panneau notifications d'absence */
  notifAbsencePanel: {
    backgroundColor: COLORS.warning + '12',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
    overflow: 'hidden',
  },
  notifAbsenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  notifAbsenceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notifAbsenceBadge: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  notifAbsenceBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
  },
  notifAbsenceTitle: {
    color: COLORS.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  notifAbsenceList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.warning + '30',
    padding: 10,
    gap: 8,
  },
  notifAbsenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.sm,
    padding: 10,
    gap: 8,
  },
  notifAbsenceItemLu: {
    opacity: 0.7,
  },
  notifAbsenceItemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  notifAbsenceAvatar: {
    marginTop: 2,
  },
  notifAbsenceName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  notifAbsenceCode: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  notifAbsenceMessage: {
    color: COLORS.warning,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  notifAbsenceNoMsg: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  notifAbsenceLuBtn: {
    backgroundColor: COLORS.success + '20',
    padding: 6,
    borderRadius: RADIUS.full,
  },

  /* Badge dans la carte de l'adhérent */
  adherentNotifBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.warning + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.warning + '35',
    marginVertical: 4,
  },
  adherentNotifText: {
    color: COLORS.warning,
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },
});
