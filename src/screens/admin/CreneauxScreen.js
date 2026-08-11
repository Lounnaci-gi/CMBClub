// src/screens/admin/CreneauxScreen.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { CATEGORIES } from '../../utils/categories';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export default function CreneauxScreen({ navigation }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  
  const { creneaux, disciplines, loadCreneaux, loadDisciplines, createCreneau, updateCreneau, deleteCreneau } = useStore();

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCreneau, setEditingCreneau] = useState(null);

  // Filters
  const [selectedDisciplineFilter, setSelectedDisciplineFilter] = useState('Toutes');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('Toutes');
  const [selectedJourFilter, setSelectedJourFilter] = useState('Tous');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [discipline, setDiscipline] = useState('');
  const [categorie, setCategorie] = useState('');
  const [jour, setJour] = useState('Lundi');
  const [heureDebut, setHeureDebut] = useState('17:00');
  const [heureFin, setHeureFin] = useState('18:30');
  const [lieu, setLieu] = useState('');
  const [remarque, setRemarque] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    await Promise.all([loadCreneaux(), loadDisciplines()]);
  }, [loadCreneaux, loadDisciplines]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const disciplineList = useMemo(() => {
    return disciplines.map(d => d.nom);
  }, [disciplines]);

  const openModal = (item = null) => {
    if (item) {
      setEditingCreneau(item);
      setDiscipline(item.discipline);
      setCategorie(item.categorie);
      setJour(item.jour);
      setHeureDebut(item.heureDebut);
      setHeureFin(item.heureFin);
      setLieu(item.lieu || '');
      setRemarque(item.remarque || '');
    } else {
      setEditingCreneau(null);
      setDiscipline(disciplineList[0] || 'KickBoxing');
      setCategorie(CATEGORIES[0]?.label || 'Poussin');
      setJour('Lundi');
      setHeureDebut('17:00');
      setHeureFin('18:30');
      setLieu('');
      setRemarque('');
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!discipline || !categorie || !jour || !heureDebut || !heureFin) {
      Alert.alert('Champs requis', 'Veuillez remplir tous les champs obligatoires.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingCreneau) {
        await updateCreneau({
          id: editingCreneau.id,
          discipline,
          categorie,
          jour,
          heureDebut: heureDebut.trim(),
          heureFin: heureFin.trim(),
          lieu: lieu.trim() || null,
          remarque: remarque.trim() || null,
        });
      } else {
        await createCreneau({
          id: `creneau-${Date.now()}`,
          discipline,
          categorie,
          jour,
          heureDebut: heureDebut.trim(),
          heureFin: heureFin.trim(),
          lieu: lieu.trim() || null,
          remarque: remarque.trim() || null,
        });
      }
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d’enregistrer le créneau.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Supprimer le créneau',
      `Voulez-vous supprimer le créneau ${item.discipline} (${item.categorie}) du ${item.jour} à ${item.heureDebut} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCreneau(item.id);
            } catch (e) {
              Alert.alert('Erreur', e.message || 'Impossible de supprimer.');
            }
          },
        },
      ]
    );
  };

  const filteredCreneaux = useMemo(() => {
    return creneaux.filter(item => {
      const matchDisc = selectedDisciplineFilter === 'Toutes' || item.discipline === selectedDisciplineFilter;
      const matchCat = selectedCategoryFilter === 'Toutes' || item.categorie === selectedCategoryFilter;
      const matchJour = selectedJourFilter === 'Tous' || item.jour === selectedJourFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        (item.discipline || '').toLowerCase().includes(q) ||
        (item.categorie || '').toLowerCase().includes(q) ||
        (item.jour || '').toLowerCase().includes(q) ||
        (item.lieu || '').toLowerCase().includes(q) ||
        (item.remarque || '').toLowerCase().includes(q);

      return matchDisc && matchCat && matchJour && matchSearch;
    });
  }, [creneaux, selectedDisciplineFilter, selectedCategoryFilter, selectedJourFilter, searchQuery]);

  return (
    <View style={styles.container}>
      {/* Header & Add button */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.topTitle}>Horaires & Créneaux</Text>
          <Text style={styles.topSubtitle}>{filteredCreneaux.length} créneau(x) configuré(s)</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => openModal()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>Créneau</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar (Style identique à Présences) */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par discipline, catégorie, jour, lieu..."
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

      {/* Selecteur par Jour (Style identique à Présences) */}
      <View style={styles.selectorSection}>
        <View style={styles.selectorHeader}>
          <MaterialCommunityIcons name="calendar-today" size={14} color={COLORS.primary} />
          <Text style={styles.sectionLabel}>Jour :</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creneauScroll}>
          {['Tous', ...JOURS].map(j => {
            const isSelected = selectedJourFilter === j;
            return (
              <TouchableOpacity
                key={j}
                style={[styles.creneauChip, isSelected && styles.creneauChipSelected]}
                onPress={() => setSelectedJourFilter(j)}
              >
                <Text style={[styles.creneauChipText, isSelected && styles.creneauChipTextSelected]}>
                  {j}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filtres par Discipline & Catégorie */}
      <View style={styles.filterSection}>
        {/* Row Discipline */}
        <View style={styles.filterRowGroup}>
          <View style={styles.selectorHeader}>
            <MaterialCommunityIcons name="run" size={14} color={COLORS.primary} />
            <Text style={styles.sectionLabel}>Discipline :</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creneauScroll}>
            {['Toutes', ...disciplineList].map(d => {
              const isSelected = selectedDisciplineFilter === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => setSelectedDisciplineFilter(d)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Row Categorie */}
        <View style={styles.filterRowGroup}>
          <View style={styles.selectorHeader}>
            <MaterialCommunityIcons name="shape" size={14} color={COLORS.secondary} />
            <Text style={styles.sectionLabel}>Catégorie :</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.creneauScroll}>
            {['Toutes', ...CATEGORIES.map(c => c.label)].map(c => {
              const isSelected = selectedCategoryFilter === c;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, isSelected && styles.chipActiveSecondary]}
                  onPress={() => setSelectedCategoryFilter(c)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextActiveSecondary]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* List of Time Slots */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {filteredCreneaux.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="calendar-clock" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun créneau trouvé</Text>
            <Text style={styles.emptyText}>Aucun créneau horaire ne correspond aux filtres sélectionnés.</Text>
          </View>
        ) : (
          filteredCreneaux.map((item) => {
            const catObj = CATEGORIES.find(c => c.label === item.categorie);
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardBadgeGroup}>
                    <View style={[styles.discBadge, { backgroundColor: COLORS.primary + '20' }]}>
                      <MaterialCommunityIcons name="run" size={14} color={COLORS.primary} />
                      <Text style={[styles.discBadgeText, { color: COLORS.primary }]}>{item.discipline}</Text>
                    </View>
                    <View style={[styles.catBadge, { backgroundColor: (catObj?.color || COLORS.secondary) + '20' }]}>
                      <Text style={{ fontSize: 11 }}>{catObj?.icon || '⭐'}</Text>
                      <Text style={[styles.catBadgeText, { color: catObj?.color || COLORS.secondary }]}>{item.categorie}</Text>
                    </View>
                  </View>

                  <View style={styles.actionBtns}>
                    <TouchableOpacity
                      style={styles.appelBtn}
                      onPress={() => navigation.navigate('Presences', { creneauId: item.id })}
                    >
                      <MaterialCommunityIcons name="clipboard-check-outline" size={16} color={COLORS.success} />
                      <Text style={styles.appelBtnText}>Appel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openModal(item)}>
                      <MaterialCommunityIcons name="pencil" size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.cardMain}>
                  <View style={styles.timeBox}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.secondary} />
                    <Text style={styles.dayText}>{item.jour}</Text>
                    <Text style={styles.timeText}>{item.heureDebut} - {item.heureFin}</Text>
                  </View>

                  {item.lieu ? (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="map-marker" size={16} color={COLORS.textMuted} />
                      <Text style={styles.infoText}>{item.lieu}</Text>
                    </View>
                  ) : null}

                  {item.remarque ? (
                    <View style={styles.infoRow}>
                      <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.textMuted} />
                      <Text style={styles.infoTextItalic}>{item.remarque}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal Form */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCreneau ? 'Modifier le créneau' : 'Nouveau créneau'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* Discipline Selection */}
              <Text style={styles.fieldLabel}>Discipline *</Text>
              <View style={styles.optionsWrap}>
                {disciplineList.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.optionChip, discipline === d && styles.optionChipSelected]}
                    onPress={() => setDiscipline(d)}
                  >
                    <Text style={[styles.optionText, discipline === d && styles.optionTextSelected]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Category Selection */}
              <Text style={styles.fieldLabel}>Catégorie d'adhérent *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity
                    key={c.label}
                    style={[styles.optionChip, categorie === c.label && styles.optionChipSelected]}
                    onPress={() => setCategorie(c.label)}
                  >
                    <Text style={{ fontSize: 13 }}>{c.icon}</Text>
                    <Text style={[styles.optionText, categorie === c.label && styles.optionTextSelected]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Jour Selection */}
              <Text style={styles.fieldLabel}>Jour de la semaine *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {JOURS.map(j => (
                  <TouchableOpacity
                    key={j}
                    style={[styles.optionChip, jour === j && styles.optionChipSelected]}
                    onPress={() => setJour(j)}
                  >
                    <Text style={[styles.optionText, jour === j && styles.optionTextSelected]}>{j}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Heures */}
              <View style={styles.rowTwo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Heure début *</Text>
                  <TextInput
                    style={styles.input}
                    value={heureDebut}
                    onChangeText={setHeureDebut}
                    placeholder="17:00"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Heure fin *</Text>
                  <TextInput
                    style={styles.input}
                    value={heureFin}
                    onChangeText={setHeureFin}
                    placeholder="18:30"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>

              {/* Lieu */}
              <Text style={styles.fieldLabel}>Lieu / Salle (Optionnel)</Text>
              <TextInput
                style={styles.input}
                value={lieu}
                onChangeText={setLieu}
                placeholder="Ex: Grande Salle A, Piscine B"
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Remarque */}
              <Text style={styles.fieldLabel}>Remarque / Consigne (Optionnel)</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                value={remarque}
                onChangeText={setRemarque}
                placeholder="Ex: Prévoir gants et protège-tibias"
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={submitting}>
                <Text style={styles.saveBtnText}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  topTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800' },
  topSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    gap: 6,
  },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  
  filterSection: {
    paddingVertical: 4,
    gap: 8,
  },
  filterRowGroup: {
    gap: 4,
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
  selectorSection: {
    paddingTop: 6,
    paddingBottom: 4,
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
  creneauChipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  creneauChipTextSelected: { color: COLORS.primary },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFF', fontWeight: '700' },
  chipActiveSecondary: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  chipTextActiveSecondary: { color: '#FFF', fontWeight: '700' },

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

  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBadgeGroup: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  discBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  discBadgeText: { fontSize: 12, fontWeight: '700' },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  catBadgeText: { fontSize: 12, fontWeight: '700' },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.success + '40',
  },
  appelBtnText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '700',
  },
  iconBtn: {
    padding: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgInput,
  },
  cardMain: {
    gap: 8,
  },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgInput,
    padding: 10,
    borderRadius: RADIUS.md,
  },
  dayText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  timeText: { color: COLORS.secondary, fontSize: 15, fontWeight: '700', marginLeft: 'auto' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  infoText: { color: COLORS.textSecondary, fontSize: 13 },
  infoTextItalic: { color: COLORS.textMuted, fontSize: 13, fontStyle: 'italic' },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '88%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  modalForm: {
    padding: 20,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionChipSelected: {
    backgroundColor: COLORS.primary + '25',
    borderColor: COLORS.primary,
  },
  optionText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  optionTextSelected: { color: COLORS.primary, fontWeight: '700' },
  rowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  saveBtnText: { color: '#FFF', fontWeight: '700' },
});
