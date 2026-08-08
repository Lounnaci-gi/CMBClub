// src/screens/admin/ConfigScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Modal, Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import useStore from '../../store/useStore';
import { COLORS, RADIUS, SHADOWS } from '../../theme/colors';

export default function ConfigScreen() {
  const { config, updateConfig, remises, loadRemises, createRemise, updateRemise, deleteRemise, logout } = useStore();
  const [fraisInscription, setFraisInscription] = useState(String(config.fraisInscription || 2000));
  const [fraisMensuel, setFraisMensuel] = useState(String(config.fraisMensuel || 1500));
  const [showRemiseModal, setShowRemiseModal] = useState(false);
  const [editingRemise, setEditingRemise] = useState(null);
  const [remiseLabel, setRemiseLabel] = useState('');
  const [remisePct, setRemisePct] = useState('');
  const [configSaved, setConfigSaved] = useState(false);

  useFocusEffect(useCallback(() => { loadRemises(); }, []));

  const handleSaveConfig = async () => {
    const fi = parseFloat(fraisInscription);
    const fm = parseFloat(fraisMensuel);
    if (isNaN(fi) || fi <= 0 || isNaN(fm) || fm <= 0) {
      Alert.alert('Erreur', 'Montants invalides');
      return;
    }
    await updateConfig('fraisInscription', fi);
    await updateConfig('fraisMensuel', fm);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
  };

  const openRemiseModal = (remise = null) => {
    setEditingRemise(remise);
    setRemiseLabel(remise?.label || '');
    setRemisePct(String(remise?.pourcentage || ''));
    setShowRemiseModal(true);
  };

  const handleSaveRemise = async () => {
    const pct = parseFloat(remisePct);
    if (!remiseLabel.trim() || isNaN(pct) || pct <= 0 || pct >= 100) {
      Alert.alert('Erreur', 'Nom requis et pourcentage entre 1 et 99');
      return;
    }
    if (editingRemise) {
      await updateRemise({ ...editingRemise, label: remiseLabel, pourcentage: pct });
    } else {
      await createRemise({ id: uuidv4(), label: remiseLabel, pourcentage: pct });
    }
    setShowRemiseModal(false);
  };

  const handleDeleteRemise = (id) => {
    Alert.alert('Supprimer la remise', 'Confirmer la suppression ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteRemise(id) },
    ]);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Tarifs */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="cash" size={20} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Tarification</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Frais d'inscription (DA)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={fraisInscription}
              onChangeText={setFraisInscription}
              keyboardType="numeric"
              placeholder="2000"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.unitBadge}><Text style={styles.unitText}>DA</Text></View>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Mensualité (DA/mois)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={fraisMensuel}
              onChangeText={setFraisMensuel}
              keyboardType="numeric"
              placeholder="1500"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.unitBadge}><Text style={styles.unitText}>DA</Text></View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, configSaved && { backgroundColor: COLORS.success }]}
          onPress={handleSaveConfig}
        >
          <MaterialCommunityIcons name={configSaved ? 'check' : 'content-save'} size={18} color="#fff" />
          <Text style={styles.saveBtnText}>{configSaved ? 'Enregistré !' : 'Sauvegarder les tarifs'}</Text>
        </TouchableOpacity>
      </View>

      {/* Remises */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="percent" size={20} color={COLORS.secondary} />
          <Text style={styles.sectionTitle}>Remises</Text>
          <TouchableOpacity style={styles.addRemiseBtn} onPress={() => openRemiseModal()}>
            <MaterialCommunityIcons name="plus" size={18} color={COLORS.primary} />
            <Text style={styles.addRemiseText}>Ajouter</Text>
          </TouchableOpacity>
        </View>

        {remises.length === 0 ? (
          <Text style={styles.emptyText}>Aucune remise configurée</Text>
        ) : (
          remises.map(r => (
            <View key={r.id} style={styles.remiseCard}>
              <View style={styles.remisePctBox}>
                <Text style={styles.remisePct}>{r.pourcentage}%</Text>
              </View>
              <View style={styles.remiseInfo}>
                <Text style={styles.remiseLabel}>{r.label}</Text>
                <Text style={styles.remiseSub}>Remise de {r.pourcentage}% sur le montant dû</Text>
              </View>
              <View style={styles.remiseActions}>
                <TouchableOpacity onPress={() => openRemiseModal(r)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="pencil" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteRemise(r.id)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="trash-can" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* App info */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="information" size={20} color={COLORS.textMuted} />
          <Text style={styles.sectionTitle}>À propos</Text>
        </View>
        <Text style={styles.aboutText}>CMBClub v1.0.0{'\n'}Gestion des adhésions sportives{'\n'}Mode hors ligne (SQLite local)</Text>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <MaterialCommunityIcons name="logout" size={18} color={COLORS.danger} />
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      {/* Remise Modal */}
      <Modal visible={showRemiseModal} transparent animationType="slide" onRequestClose={() => setShowRemiseModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingRemise ? 'Modifier la remise' : 'Nouvelle remise'}</Text>

            <Text style={styles.fieldLabel}>Nom de la remise</Text>
            <TextInput
              style={styles.modalInput}
              value={remiseLabel}
              onChangeText={setRemiseLabel}
              placeholder="Ex: Remise famille, Fidélité..."
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.fieldLabel}>Pourcentage (%)</Text>
            <TextInput
              style={styles.modalInput}
              value={remisePct}
              onChangeText={setRemisePct}
              keyboardType="numeric"
              placeholder="Ex: 10"
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRemiseModal(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveRemise}>
                <MaterialCommunityIcons name="content-save" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  section: {
    backgroundColor: COLORS.bgCard,
    margin: 16,
    marginBottom: 0,
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  fieldGroup: { gap: 6 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  unitBadge: {
    backgroundColor: COLORS.primary + '20',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  unitText: { color: COLORS.primary, fontWeight: '700' },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.button,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  addRemiseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  addRemiseText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  remiseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  remisePctBox: {
    width: 52,
    height: 52,
    backgroundColor: COLORS.secondary + '20',
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.secondary + '40',
  },
  remisePct: { color: COLORS.secondary, fontWeight: '800', fontSize: 16 },
  remiseInfo: { flex: 1 },
  remiseLabel: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 14 },
  remiseSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  remiseActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  aboutText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 22 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 16,
    marginTop: 20,
    backgroundColor: COLORS.danger + '15',
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
  },
  logoutText: { color: COLORS.danger, fontWeight: '700', fontSize: 15 },
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
  modalInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
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
  modalSaveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
  },
});
