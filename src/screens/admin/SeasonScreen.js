// src/screens/admin/SeasonScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, ScrollView, KeyboardAvoidingView,
  Platform, ActivityIndicator,
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
  const { saisons, saisonActive, loadSaisons, createSaison, activateSaison, updateSaison, deleteSaison, closeSaison } = useStore();
  
  // États pour modal créer
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [annee, setAnnee] = useState(String(getCurrentSeasonYear()));
  
  // États pour modal éditer
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSaison, setEditingSaison] = useState(null);
  const [editDateDebut, setEditDateDebut] = useState('');
  const [editDateFin, setEditDateFin] = useState('');

  // Confirmation administrateur requise avant la clôture d'une saison
  const [showCloseAuthModal, setShowCloseAuthModal] = useState(false);
  const [saisonToClose, setSaisonToClose] = useState(null);
  const [closeUsername, setCloseUsername] = useState('');
  const [closePassword, setClosePassword] = useState('');
  const [showClosePassword, setShowClosePassword] = useState(false);
  const [isClosingSeason, setIsClosingSeason] = useState(false);
  
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
      // D1 requires an end date; a season follows the calendar year.
      dateFin: `${y}-12-31`,
      actif: 0,
    });
    setShowCreateModal(false);
    setAnnee(String(getCurrentSeasonYear()));
    Alert.alert('✅ Saison créée', `La saison ${label} a été créée et est ouverte pour les inscriptions.`);
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

  const handleEditPress = (saison) => {
    setEditingSaison(saison);
    setEditDateDebut(saison.dateDebut);
    setEditDateFin(saison.dateFin);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editDateDebut || !editDateFin) {
      Alert.alert('Erreur', 'Les dates de début et fin sont requises');
      return;
    }
    
    if (new Date(editDateDebut) >= new Date(editDateFin)) {
      Alert.alert('Erreur', 'La date de début doit être avant la date de fin');
      return;
    }

    try {
      await updateSaison(editingSaison.id, {
        dateDebut: editDateDebut,
        dateFin: editDateFin,
      });
      setShowEditModal(false);
      Alert.alert('✅ Saison modifiée', `Les dates de la saison ${editingSaison.label} ont été mises à jour.`);
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const handleDeletePress = (saison) => {
    if (saison.actif || saison.id === saisonActive?.id) {
      Alert.alert(
        '⛔ Action impossible',
        `La saison "${saison.label}" est actuellement active.\n\nUne application a toujours besoin d'une saison active. Pour supprimer cette saison, activez d'abord une autre saison.`
      );
      return;
    }

    Alert.alert(
      '⚠️ Supprimer la saison',
      `Êtes-vous sûr de vouloir supprimer la saison ${saison.label} ?\n\n⚠️ Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSaison(saison.id);
              Alert.alert('✅ Saison supprimée', `La saison ${saison.label} a été supprimée.`);
            } catch (e) {
              Alert.alert('Erreur', e.message);
            }
          },
        },
      ],
    );
  };

  const handleClosePress = (saison) => {
    setSaisonToClose(saison);
    setCloseUsername('');
    setClosePassword('');
    setShowClosePassword(false);
    setShowCloseAuthModal(true);
  };

  const closeAuthModal = (force = false) => {
    if (isClosingSeason && !force) return;
    setShowCloseAuthModal(false);
    setSaisonToClose(null);
    setClosePassword('');
  };

  const handleConfirmClose = async () => {
    if (!closeUsername.trim() || !closePassword.trim()) {
      Alert.alert('Identifiants requis', 'Saisissez l’identifiant et le mot de passe administrateur.');
      return;
    }

    if (!saisonToClose) return;

    setIsClosingSeason(true);
    try {
      await closeSaison(saisonToClose.id, {
        username: closeUsername,
        password: closePassword,
      });
      const label = saisonToClose.label;
      const isReopening = saisonToClose.statut === 'fermé';
      closeAuthModal(true);
      Alert.alert(
        isReopening ? 'Saison rouverte' : 'Saison clôturée',
        `La saison ${label} est désormais ${isReopening ? 'ouverte' : 'fermée'}.`,
      );
    } catch (e) {
      Alert.alert('Action refusée', e.message || 'Les identifiants administrateur sont invalides.');
    } finally {
      setIsClosingSeason(false);
    }
  };

  const renderSaison = ({ item }) => {
    const isActive = item.id === saisonActive?.id;
    const isClosed = item.statut === 'fermé';
    return (
      <View style={[styles.card, isActive && styles.activeCard]}>
        <View style={styles.cardLeft}>
          <View style={[styles.yearBadge, { backgroundColor: isActive ? COLORS.primary : COLORS.bgInput }]}>
            <Text style={[styles.yearText, { color: isActive ? '#fff' : COLORS.textSecondary }]}>
              {item.annee}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.saisonLabel}>Saison {item.label}</Text>
            <Text style={styles.saisonDates}>
              Depuis le {new Date(item.dateDebut).toLocaleDateString('fr-FR')}
              {item.dateFin ? ` jusqu'au ${new Date(item.dateFin).toLocaleDateString('fr-FR')}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {isActive && (
                <View style={styles.activeBadge}>
                  <MaterialCommunityIcons name="check-circle" size={12} color={COLORS.success} />
                  <Text style={styles.activeText}>Active</Text>
                </View>
              )}
              <View style={[styles.statusBadge, { backgroundColor: isClosed ? COLORS.danger + '20' : COLORS.success + '20' }]}>
                <MaterialCommunityIcons 
                  name={isClosed ? 'lock' : 'lock-open-variant'} 
                  size={12} 
                  color={isClosed ? COLORS.danger : COLORS.success} 
                />
                <Text style={{ color: isClosed ? COLORS.danger : COLORS.success, fontSize: 11, fontWeight: '600' }}>
                  {isClosed ? 'Fermée' : 'Ouverte'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.primary + '20' }]}
            onPress={() => handleClosePress(item)}
          >
            <MaterialCommunityIcons 
              name={isClosed ? 'lock-open' : 'lock'} 
              size={18} 
              color={COLORS.primary} 
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.danger + '20' }]}
            onPress={() => handleDeletePress(item)}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.danger} />
          </TouchableOpacity>

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
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
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
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
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
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
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

      {/* Close season authorization */}
      <Modal
        visible={showCloseAuthModal}
        transparent
        animationType="slide"
        onRequestClose={closeAuthModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.authTitleRow}>
              <View style={styles.authIcon}>
                <MaterialCommunityIcons name="shield-lock-outline" size={22} color={COLORS.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {saisonToClose?.statut === 'fermé' ? 'Autoriser la réouverture' : 'Autoriser la clôture'}
                </Text>
                <Text style={styles.authIntro}>
                  Saisissez les identifiants administrateur pour {saisonToClose?.statut === 'fermé' ? 'rouvrir' : 'clôturer'} la saison {saisonToClose?.label}.
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Identifiant administrateur</Text>
            <TextInput
              style={styles.input}
              value={closeUsername}
              onChangeText={setCloseUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              placeholder="Identifiant"
              placeholderTextColor={COLORS.textMuted}
              editable={!isClosingSeason}
              accessibilityLabel="Identifiant administrateur"
            />

            <Text style={styles.fieldLabel}>Mot de passe administrateur</Text>
            <View style={styles.passwordInputRow}>
              <TextInput
                style={styles.passwordInput}
                value={closePassword}
                onChangeText={setClosePassword}
                secureTextEntry={!showClosePassword}
                autoComplete="current-password"
                textContentType="password"
                placeholder="Mot de passe"
                placeholderTextColor={COLORS.textMuted}
                editable={!isClosingSeason}
                accessibilityLabel="Mot de passe administrateur"
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowClosePassword(value => !value)}
                disabled={isClosingSeason}
                accessibilityRole="button"
                accessibilityLabel={showClosePassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                <MaterialCommunityIcons
                  name={showClosePassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeAuthModal}
                disabled={isClosingSeason}
                accessibilityRole="button"
                accessibilityLabel="Annuler la modification de la saison"
              >
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, styles.closeConfirmBtn, isClosingSeason && styles.closeConfirmBtnDisabled]}
                onPress={handleConfirmClose}
                disabled={isClosingSeason}
                accessibilityRole="button"
                accessibilityLabel="Confirmer la modification avec les identifiants administrateur"
              >
                {isClosingSeason ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <MaterialCommunityIcons name={saisonToClose?.statut === 'fermé' ? 'lock-open' : 'lock'} size={18} color="#fff" />
                )}
                <Text style={styles.saveBtnText}>
                  {isClosingSeason ? 'Vérification…' : saisonToClose?.statut === 'fermé' ? 'Rouvrir' : 'Clôturer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Modifier la saison {editingSaison?.label}</Text>

              <Text style={styles.fieldLabel}>📅 Date de début</Text>
              <TextInput
                style={styles.input}
                value={editDateDebut}
                onChangeText={setEditDateDebut}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
              />

              <Text style={styles.fieldLabel} style={{ marginTop: 16 }}>📅 Date de fin</Text>
              <TextInput
                style={styles.input}
                value={editDateFin}
                onChangeText={setEditDateFin}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textMuted}
              />

              <View style={styles.infoBox}>
                <MaterialCommunityIcons name="information" size={16} color={COLORS.textMuted} />
                <Text style={styles.infoText}>Les dates doivent être au format YYYY-MM-DD</Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEditModal(false)}>
                  <Text style={styles.cancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                  <MaterialCommunityIcons name="check" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  activateBtnDone: { backgroundColor: COLORS.success + '20', borderWidth: 1, borderColor: COLORS.success + '40' },
  activateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  statusBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4, 
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 24,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
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
    marginBottom: 16,
  },
  previewText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 16,
  },
  infoText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '500' },
  authTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  authIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.danger + '18',
  },
  authIntro: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: -12 },
  passwordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  passwordInput: { flex: 1, color: COLORS.textPrimary, fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
  passwordToggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
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
  closeConfirmBtn: { backgroundColor: COLORS.danger },
  closeConfirmBtnDisabled: { opacity: 0.7 },
});
