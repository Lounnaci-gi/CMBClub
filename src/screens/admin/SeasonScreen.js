// src/screens/admin/SeasonScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { generateSeasonLabel, getCurrentSeasonYear, canCreateSeason } from '../../utils/seasons';

export default function SeasonScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { saisons, saisonActive, loadSaisons, createSaison, activateSaison } = useStore();
  const [showModal, setShowModal] = useState(false);
  const [annee, setAnnee] = useState(String(getCurrentSeasonYear()));
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { loadSaisons(); }, []));

  const onRefresh = async () => { setRefreshing(true); await loadSaisons(); setRefreshing(false); };

  const handleCreate = async () => {
    const y = parseInt(annee);
    if (isNaN(y) || y < 2020 || y > 2060) {
      Alert.alert('Erreur', 'Année invalide (entre 2020 et 2060)');
      return;
    }
    const check = canCreateSeason(y);
    if (!check.allowed) {
      Alert.alert('Création impossible ⛔', check.reason);
      return;
    }
    const label = generateSeasonLabel(y);
    const existing = saisons.find(s => s.annee === y || s.label === label);
    if (existing) {
      Alert.alert('Erreur', `La saison ${label} existe déjà`);
      return;
    }
    await createSaison({
      id: uuidv4(),
      label,
      annee: y,
      dateDebut: `${y}-01-01`,
      dateFin: `${y}-12-31`,
      actif: 0,
    });
    setShowModal(false);
    Alert.alert('✅ Saison créée', `La saison ${label} (01/01/${y} – 31/12/${y}) a été créée.`);
  };

  const handleActivate = (saison) => {
    if (saison.id === saisonActive?.id) return;
    Alert.alert(
      'Activer la saison',
      `Activer la saison ${saison.label} comme saison courante ?\n\n💡 Remarque : L'inscription et l'assurance devront être renouvelées au cas par cas pour les adhérents sur cette nouvelle saison.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Activer',
          onPress: async () => {
            await activateSaison(saison.id);
            Alert.alert('Saison activée 🚀', `La saison ${saison.label} est désormais active.`);
          },
        },
      ],
    );
  };

  const renderSaison = ({ item }) => {
    const isActive = item.id === saisonActive?.id;
    return (
      <View style={[styles.card, isActive && styles.activeCard]}>
        <View style={styles.cardLeft}>
          <View style={[styles.yearBadge, { backgroundColor: isActive ? COLORS.primary : COLORS.bgInput }]}>
            <Text style={[styles.yearText, { color: isActive ? '#fff' : COLORS.textSecondary }]}>
              {item.annee}
            </Text>
          </View>
          <View>
            <Text style={styles.saisonLabel}>Saison {item.label}</Text>
            <Text style={styles.saisonDates}>
              01 Jan. {item.annee} – 31 Déc. {item.annee}
            </Text>
            {isActive && (
              <View style={styles.activeBadge}>
                <MaterialCommunityIcons name="check-circle" size={12} color={COLORS.success} />
                <Text style={styles.activeText}>Saison active</Text>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.activateBtn, isActive && styles.activateBtnDone]}
          onPress={() => handleActivate(item)}
          disabled={isActive}
        >
          <Text style={[styles.activateBtnText, isActive && { color: COLORS.success }]}>
            {isActive ? 'Active' : 'Activer'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Saisons sportives</Text>
          <Text style={styles.headerSub}>
            {saisons.length} saison{saisons.length > 1 ? 's' : ''} configurée{saisons.length > 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <MaterialCommunityIcons name="plus" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Nouvelle</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={saisons}
        keyExtractor={item => item.id}
        renderItem={renderSaison}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="calendar-blank" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucune saison configurée</Text>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Créer une nouvelle saison</Text>

            <Text style={styles.fieldLabel}>Année de la saison</Text>
            <TextInput
              style={styles.input}
              value={annee}
              onChangeText={setAnnee}
              keyboardType="numeric"
              placeholder="Ex: 2026"
              placeholderTextColor={COLORS.textMuted}
            />

            {annee.length === 4 && !isNaN(parseInt(annee)) && (
              <View style={styles.previewBox}>
                <MaterialCommunityIcons name="information" size={16} color={COLORS.primary} />
                <Text style={styles.previewText}>
                  Saison {generateSeasonLabel(parseInt(annee))} (01 Jan {annee} – 31 Déc {annee})
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreate}>
                <MaterialCommunityIcons name="calendar-plus" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800' },
  headerSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...SHADOWS.button,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { paddingHorizontal: 16, gap: 12, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  activeCard: {
    borderColor: COLORS.primary + '50',
    backgroundColor: COLORS.primary + '08',
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  yearBadge: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: { fontWeight: '800', fontSize: 17 },
  saisonLabel: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 17 },
  saisonDates: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  activeText: { color: COLORS.success, fontSize: 12, fontWeight: '600' },
  activateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  activateBtnDone: { backgroundColor: COLORS.success + '20', borderWidth: 1, borderColor: COLORS.success + '40' },
  activateBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 24,
    gap: 14,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 14,
    textAlign: 'center',
    letterSpacing: 4,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  previewText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: { color: COLORS.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    ...SHADOWS.button,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
