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
  const [dateSeance, setDateSeance] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('tous'); // 'tous' | 'present' | 'absent' | 'retard' | 'excuse'
  const [adherents, setAdherents] = useState([]);
  const [presenceMap, setPresenceMap] = useState({}); // adherentId -> { statut, remarque }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedCreneau = useMemo(() => {
    return creneaux.find(c => c.id === selectedCreneauId) || creneaux[0] || null;
  }, [creneaux, selectedCreneauId]);

  useEffect(() => {
    if (!selectedCreneauId && creneaux.length > 0) {
      setSelectedCreneauId(creneaux[0].id);
    }
  }, [creneaux, selectedCreneauId]);

  const loadData = useCallback(async () => {
    if (!selectedCreneau || !saisonActive) return;
    setLoading(true);
    try {
      await loadSaisons();
      await loadCreneaux();
      const eligible = await getEligibleAdherents(selectedCreneau.id, saisonActive.id);
      setAdherents(eligible);

      const existing = await getPresencesSeance(selectedCreneau.id, dateSeance);
      const map = {};
      
      // Default everyone to present if no prior record, or map existing
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
      Alert.alert('Erreur', e.message || 'Impossible de charger les presences.');
    } finally {
      setLoading(false);
    }
  }, [selectedCreneau, saisonActive, dateSeance, getEligibleAdherents, getPresencesSeance, loadCreneaux, loadSaisons]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleStatutChange = (adherentId, statut) => {
    setPresenceMap(prev => ({
      ...prev,
      [adherentId]: { ...prev[adherentId], statut },
    }));
  };

  const handleRemarqueChange = (adherentId, remarque) => {
    setPresenceMap(prev => ({
      ...prev,
      [adherentId]: { ...prev[adherentId], remarque },
    }));
  };

  const handleMarkAllPresent = () => {
    setPresenceMap(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        next[id] = { ...next[id], statut: 'present' };
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedCreneau || !saisonActive) return;
    setSaving(true);
    try {
      const list = Object.entries(presenceMap).map(([adherentId, data]) => ({
        adherentId,
        statut: data.statut,
        remarque: data.remarque,
      }));
      await savePresencesSeance(selectedCreneau.id, dateSeance, saisonActive.id, list);
      Alert.alert('Succès', 'Les présences de la séance ont été enregistrées avec succès.');
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d’enregistrer.');
    } finally {
      setSaving(false);
    }
  };

  // Quick Stats
  const statsSummary = useMemo(() => {
    let presents = 0, absents = 0, retards = 0, excuses = 0;
    Object.values(presenceMap).forEach(p => {
      if (p.statut === 'present') presents++;
      else if (p.statut === 'absent') absents++;
      else if (p.statut === 'retard') retards++;
      else if (p.statut === 'excuse') excuses++;
    });
    return { total: adherents.length, presents, absents, retards, excuses };
  }, [presenceMap, adherents]);

  const filteredAdherents = useMemo(() => {
    if (statusFilter === 'tous') return adherents;
    return adherents.filter(a => {
      const currentStatut = presenceMap[a.id]?.statut || 'present';
      return currentStatut === statusFilter;
    });
  }, [adherents, presenceMap, statusFilter]);

  const catObj = selectedCreneau ? CATEGORIES.find(c => c.label === selectedCreneau.categorie) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Creneaux Selector */}
      <View style={styles.selectorSection}>
        <Text style={styles.sectionLabel}>Sélectionner un créneau :</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creneauScroll}>
          {creneaux.map(c => {
            const isSelected = c.id === selectedCreneau?.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.creneauChip, isSelected && styles.creneauChipSelected]}
                onPress={() => setSelectedCreneauId(c.id)}
              >
                <Text style={[styles.creneauChipText, isSelected && styles.creneauChipTextSelected]}>
                  {c.discipline} · {c.jour} {c.heureDebut}
                </Text>
                <Text style={[styles.creneauChipCat, isSelected && { color: COLORS.primary }]}>
                  {c.categorie}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Date & Session Bar */}
      {selectedCreneau && (
        <View style={styles.dateBar}>
          <View style={styles.dateBox}>
            <MaterialCommunityIcons name="calendar" size={18} color={COLORS.secondary} />
            <TextInput
              style={styles.dateInput}
              value={dateSeance}
              onChangeText={setDateSeance}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllPresent}>
            <MaterialCommunityIcons name="check-all" size={16} color={COLORS.success} />
            <Text style={styles.markAllText}>Tout présent</Text>
          </TouchableOpacity>
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

        <TouchableOpacity
          style={[styles.statPill, { backgroundColor: COLORS.secondary + '15' }, statusFilter === 'excuse' && styles.statPillActiveSecondary]}
          onPress={() => setStatusFilter('excuse')}
        >
          <Text style={[styles.statVal, { color: COLORS.secondary }, statusFilter === 'excuse' && { color: '#FFF' }]}>{statsSummary.excuses}</Text>
          <Text style={[styles.statLbl, statusFilter === 'excuse' && { color: '#FFF' }]}>Excusés</Text>
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
                </View>

                {/* Status Toggle Buttons */}
                <View style={styles.statusRow}>
                  <TouchableOpacity
                    style={[styles.statusBtn, current.statut === 'present' && styles.btnPresent]}
                    onPress={() => handleStatutChange(adherent.id, 'present')}
                  >
                    <MaterialCommunityIcons name="check-circle" size={16} color={current.statut === 'present' ? '#FFF' : COLORS.success} />
                    <Text style={[styles.statusBtnText, current.statut === 'present' && styles.textActive]}>Présent</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, current.statut === 'absent' && styles.btnAbsent]}
                    onPress={() => handleStatutChange(adherent.id, 'absent')}
                  >
                    <MaterialCommunityIcons name="close-circle" size={16} color={current.statut === 'absent' ? '#FFF' : COLORS.danger} />
                    <Text style={[styles.statusBtnText, current.statut === 'absent' && styles.textActive]}>Absent</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, current.statut === 'retard' && styles.btnRetard]}
                    onPress={() => handleStatutChange(adherent.id, 'retard')}
                  >
                    <MaterialCommunityIcons name="clock-alert" size={16} color={current.statut === 'retard' ? '#FFF' : COLORS.warning} />
                    <Text style={[styles.statusBtnText, current.statut === 'retard' && styles.textActive]}>Retard</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, current.statut === 'excuse' && styles.btnExcuse]}
                    onPress={() => handleStatutChange(adherent.id, 'excuse')}
                  >
                    <MaterialCommunityIcons name="account-check" size={16} color={current.statut === 'excuse' ? '#FFF' : COLORS.secondary} />
                    <Text style={[styles.statusBtnText, current.statut === 'excuse' && styles.textActive]}>Excusé</Text>
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
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <MaterialCommunityIcons name="content-save" size={20} color="#FFF" />
            <Text style={styles.saveBtnText}>{saving ? 'Enregistrement...' : 'Enregistrer la séance'}</Text>
          </TouchableOpacity>
        </View>
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
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 6,
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
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateInput: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 110,
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
});
