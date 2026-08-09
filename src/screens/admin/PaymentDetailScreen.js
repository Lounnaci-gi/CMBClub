// src/screens/admin/PaymentDetailScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import PaymentCard from '../../components/PaymentCard';
import useTheme from '../../theme/useTheme';
import { calculateBalance, getStatusColor, getStatusLabel, PAYMENT_STATUS } from '../../utils/payments';
import { getPaiementsByAdherent, refreshPaymentStatuses } from '../../database/database';

export default function PaymentDetailScreen({ route }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { adherentId } = route.params;
  const { adherents, saisonActive, remises, loadRemises, updatePaiement } = useStore();
  const [paiements, setPaiements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [montantPaye, setMontantPaye] = useState('');
  const [selectedRemise, setSelectedRemise] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const adherent = adherents.find(a => a.id === adherentId);

  const load = useCallback(async () => {
    if (adherent && saisonActive) {
      await refreshPaymentStatuses(saisonActive.id);
      const p = await getPaiementsByAdherent(adherent.id, saisonActive.id);
      setPaiements(p);
      await loadRemises();
    }
  }, [adherent, saisonActive, loadRemises]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openPayModal = (p) => {
    setSelected(p);
    const remise = remises.find(r => r.id === p.remiseId);
    setMontantPaye(String(p.montantPaye || ''));
    setSelectedRemise(remise || null);
    setNotes(p.notes || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const remiseMontant = selectedRemise
        ? Math.round(selected.montantDu * selectedRemise.pourcentage / 100)
        : 0;
      const net = selected.montantDu - remiseMontant;
      const paye = parseFloat(montantPaye) || 0;
      let statut = PAYMENT_STATUS.A_PAYER;
      if (paye >= net) statut = PAYMENT_STATUS.PAYE;
      else {
        const dueDate = selected.annee && selected.mois
          ? new Date(selected.annee, selected.mois - 1, 10)
          : new Date();
        if (new Date() > dueDate && paye < net) statut = PAYMENT_STATUS.EN_RETARD;
      }

      await updatePaiement({
        ...selected,
        montantPaye: paye,
        remisePct: selectedRemise?.pourcentage || 0,
        remiseMontant,
        datePaiement: paye > 0 ? new Date().toISOString() : null,
        statut,
        notes,
      });

      setShowModal(false);
      await load();
      Alert.alert('✅ Paiement enregistré');
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally {
      setSaving(false);
    }
  };

  const balance = calculateBalance(paiements);

  const payé = paiements.filter(p => p.statut === PAYMENT_STATUS.PAYE).length;
  const retard = paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD).length;
  const aPayer = paiements.filter(p => p.statut === PAYMENT_STATUS.A_PAYER).length;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceName}>
            {adherent?.prenom} {adherent?.nom}
          </Text>
          <Text style={styles.saisonLabel}>{saisonActive?.label}</Text>

          <View style={styles.balanceRow}>
            <View style={styles.balanceCol}>
              <Text style={styles.balanceAmt}>{balance.totalDu.toLocaleString()}</Text>
              <Text style={styles.balanceLbl}>Total dû (DA)</Text>
            </View>
            <View style={[styles.divider]} />
            <View style={styles.balanceCol}>
              <Text style={[styles.balanceAmt, { color: COLORS.success }]}>{balance.totalPaye.toLocaleString()}</Text>
              <Text style={styles.balanceLbl}>Payé (DA)</Text>
            </View>
            <View style={[styles.divider]} />
            <View style={styles.balanceCol}>
              <Text style={[styles.balanceAmt, { color: balance.solde > 0 ? COLORS.danger : COLORS.success }]}>
                {balance.solde.toLocaleString()}
              </Text>
              <Text style={styles.balanceLbl}>Solde (DA)</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: COLORS.success + '20' }]}>
              <MaterialCommunityIcons name="check-circle" size={13} color={COLORS.success} />
              <Text style={[styles.statChipText, { color: COLORS.success }]}>{payé} payé</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: COLORS.danger + '20' }]}>
              <MaterialCommunityIcons name="alert-circle" size={13} color={COLORS.danger} />
              <Text style={[styles.statChipText, { color: COLORS.danger }]}>{retard} retard</Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: COLORS.warning + '20' }]}>
              <MaterialCommunityIcons name="clock" size={13} color={COLORS.warning} />
              <Text style={[styles.statChipText, { color: COLORS.warning }]}>{aPayer} à payer</Text>
            </View>
          </View>
        </View>

        {/* Payment list */}
        <Text style={styles.sectionTitle}>Détail des paiements</Text>
        <View style={styles.list}>
          {paiements.map(p => (
            <PaymentCard
              key={p.id}
              paiement={p}
              onPress={() => openPayModal(p)}
            />
          ))}
          {paiements.length === 0 && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="cash-remove" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Aucun paiement pour cette saison</Text>
            </View>
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Payment Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {selected?.type === 'inscription' ? '🎟️ Inscription' : '📅 Mensualité'}
            </Text>
            <Text style={styles.modalSubtitle}>{selected?.label}</Text>

            {/* Remise selector */}
            <Text style={styles.modalLabel}>Remise applicable</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.remiseChip, !selectedRemise && styles.remiseChipActive]}
                  onPress={() => setSelectedRemise(null)}
                >
                  <Text style={[styles.remiseText, !selectedRemise && { color: COLORS.primary }]}>Aucune</Text>
                </TouchableOpacity>
                {remises.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.remiseChip, selectedRemise?.id === r.id && styles.remiseChipActive]}
                    onPress={() => setSelectedRemise(selectedRemise?.id === r.id ? null : r)}
                  >
                    <Text style={[styles.remiseText, selectedRemise?.id === r.id && { color: COLORS.primary }]}>
                      {r.label} ({r.pourcentage}%)
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Amounts */}
            <View style={styles.amountSummary}>
              <View style={styles.amtRow}>
                <Text style={styles.amtLabel}>Montant de base</Text>
                <Text style={styles.amtValue}>{selected?.montantDu?.toLocaleString()} DA</Text>
              </View>
              {selectedRemise && (
                <View style={styles.amtRow}>
                  <Text style={styles.amtLabel}>Remise ({selectedRemise.pourcentage}%)</Text>
                  <Text style={[styles.amtValue, { color: COLORS.success }]}>
                    -{Math.round((selected?.montantDu || 0) * selectedRemise.pourcentage / 100).toLocaleString()} DA
                  </Text>
                </View>
              )}
              <View style={[styles.amtRow, styles.amtTotal]}>
                <Text style={[styles.amtLabel, { color: COLORS.textPrimary, fontWeight: '700' }]}>Net à payer</Text>
                <Text style={[styles.amtValue, { color: COLORS.primary, fontSize: 18 }]}>
                  {(selected
                    ? selected.montantDu - (selectedRemise ? Math.round(selected.montantDu * selectedRemise.pourcentage / 100) : 0)
                    : 0
                  ).toLocaleString()} DA
                </Text>
              </View>
            </View>

            {/* Montant payé input */}
            <Text style={styles.modalLabel}>Montant encaissé (DA)</Text>
            <TextInput
              style={styles.modalInput}
              value={montantPaye}
              onChangeText={setMontantPaye}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
            />

            {/* Notes */}
            <Text style={styles.modalLabel}>Notes (optionnel)</Text>
            <TextInput
              style={[styles.modalInput, { height: 70 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Observations..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                <MaterialCommunityIcons name="content-save" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
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
  balanceCard: {
    backgroundColor: COLORS.primary,
    margin: 16,
    borderRadius: RADIUS.xl,
    padding: 20,
    gap: 12,
    ...SHADOWS.button,
  },
  balanceName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  saisonLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  balanceRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: RADIUS.md,
    padding: 14,
  },
  balanceCol: { flex: 1, alignItems: 'center', gap: 4 },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
  balanceAmt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  balanceLbl: { color: 'rgba(255,255,255,0.65)', fontSize: 11, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  statChipText: { fontSize: 12, fontWeight: '700' },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 20 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },

  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 24,
    gap: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  modalSubtitle: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 4 },
  modalLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  modalInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  remiseChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  remiseChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  remiseText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 },
  amountSummary: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  amtRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amtTotal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    marginTop: 4,
  },
  amtLabel: { color: COLORS.textMuted, fontSize: 13 },
  amtValue: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
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
