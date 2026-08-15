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
  const canManagePayments = Boolean(saisonActive);

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
    if (!canManagePayments) {
      Alert.alert('Saison requise', 'Créez ou rouvrez une saison avant d’enregistrer un paiement.');
      return;
    }
    setSelected(p);
    const remise = remises.find(r => r.id === p.remiseId);
    const remiseM = remise
      ? Math.round(p.montantDu * remise.pourcentage / 100)
      : (p.remiseMontant || 0);
    const net = (p.montantDu || 0) - remiseM;
    const reste = Math.max(0, net - (p.montantPaye || 0));
    setMontantPaye(String(reste > 0 ? reste : net));
    setSelectedRemise(remise || null);
    setNotes(p.notes || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    if (!canManagePayments) {
      Alert.alert('Saison requise', 'Créez ou rouvrez une saison avant d’enregistrer un paiement.');
      return;
    }
    setSaving(true);
    try {
      const remiseMontant = selectedRemise
        ? Math.round(selected.montantDu * selectedRemise.pourcentage / 100)
        : (selected.remiseMontant || 0);
      const net = selected.montantDu - remiseMontant;
      const currentPaid = selected.montantPaye || 0;
      const cashEntered = parseFloat(montantPaye) || 0;
      const totalPaidForSelected = currentPaid + cashEntered;

      const todayIso = new Date().toISOString();

      if (totalPaidForSelected <= net) {
        let statut = PAYMENT_STATUS.A_PAYER;
        if (totalPaidForSelected >= net && net >= 0) statut = PAYMENT_STATUS.PAYE;
        else if (totalPaidForSelected > 0) statut = PAYMENT_STATUS.AVANCE;

        await updatePaiement({
          ...selected,
          montantPaye: totalPaidForSelected,
          remisePct: selectedRemise?.pourcentage || 0,
          remiseMontant,
          datePaiement: totalPaidForSelected > 0 ? todayIso : selected.datePaiement,
          statut,
          notes,
        });

        setShowModal(false);
        await load();
        Alert.alert('✅ Versement enregistré', `Montant encaissé : ${cashEntered.toLocaleString()} DA`);
      } else {
        // Le montant encaissé dépasse le reste à payer sur cet élément -> Avance automatique sur les mois suivants
        let surplus = totalPaidForSelected - net;

        // 1. Solder l'élément en cours
        await updatePaiement({
          ...selected,
          montantPaye: net,
          remisePct: selectedRemise?.pourcentage || 0,
          remiseMontant,
          datePaiement: todayIso,
          statut: PAYMENT_STATUS.PAYE,
          notes,
        });

        // 2. Allouer le surplus sur les mois suivants de la saison
        const otherUnpaid = paiements
          .filter(p => p.id !== selected.id && ((p.montantDu || 0) - (p.remiseMontant || 0) - (p.montantPaye || 0)) > 0)
          .sort((a, b) => {
            if (a.type === 'inscription') return -1;
            if (b.type === 'inscription') return 1;
            const ya = a.annee || 0; const yb = b.annee || 0;
            if (ya !== yb) return ya - yb;
            const ma = a.mois || 0; const mb = b.mois || 0;
            return ma - mb;
          });

        let extraMonthsCount = 0;
        for (const item of otherUnpaid) {
          if (surplus <= 0) break;
          const itemNet = (item.montantDu || 0) - (item.remiseMontant || 0);
          const itemCurrentPaye = item.montantPaye || 0;
          const itemRemaining = Math.max(0, itemNet - itemCurrentPaye);

          const allocated = Math.min(surplus, itemRemaining);
          const itemNewPaye = itemCurrentPaye + allocated;
          surplus -= allocated;
          extraMonthsCount++;

          let itemStatut = PAYMENT_STATUS.A_PAYER;
          if (itemNewPaye >= itemNet && itemNet >= 0) itemStatut = PAYMENT_STATUS.PAYE;
          else if (itemNewPaye > 0) itemStatut = PAYMENT_STATUS.AVANCE;

          await updatePaiement({
            ...item,
            montantPaye: itemNewPaye,
            datePaiement: todayIso,
            statut: itemStatut,
            notes: item.notes ? `${item.notes} [Avance]`.trim() : '[Avance de versement]',
          });
        }

        setShowModal(false);
        await load();
        Alert.alert(
          '✅ Versement enregistré avec avance',
          `Montant total encaissé : ${cashEntered.toLocaleString()} DA\n• ${selected.label} : Réglé à 100%\n• ${extraMonthsCount} mois supplémentaire(s) avancé(s)`
        );
      }
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  // Multi-month modal state
  const [showMultiModal, setShowMultiModal] = useState(false);
  const [nbMoisMulti, setNbMoisMulti] = useState(1);
  const [montantAvanceMulti, setMontantAvanceMulti] = useState('');
  const [selectedRemiseMulti, setSelectedRemiseMulti] = useState(null);
  const [notesMulti, setNotesMulti] = useState('');
  const [savingMulti, setSavingMulti] = useState(false);
  const [isCustomMontant, setIsCustomMontant] = useState(false);

  const unpaidPaiements = useMemo(() => {
    return paiements
      .filter(p => {
        const net = (p.montantDu || 0) - (p.remiseMontant || 0);
        return (p.montantPaye || 0) < net;
      })
      .sort((a, b) => {
        if (a.type === 'inscription') return -1;
        if (b.type === 'inscription') return 1;
        const ya = a.annee || 0;
        const yb = b.annee || 0;
        if (ya !== yb) return ya - yb;
        const ma = a.mois || 0;
        const mb = b.mois || 0;
        return ma - mb;
      });
  }, [paiements]);

  const selectedMultiItems = useMemo(() => {
    return unpaidPaiements.slice(0, Math.min(nbMoisMulti, unpaidPaiements.length));
  }, [unpaidPaiements, nbMoisMulti]);

  const totalDuMulti = useMemo(() => {
    return selectedMultiItems.reduce((sum, item) => {
      const remisePct = selectedRemiseMulti ? selectedRemiseMulti.pourcentage : (item.remisePct || 0);
      const remiseMontant = Math.round((item.montantDu || 0) * remisePct / 100);
      const net = (item.montantDu || 0) - remiseMontant;
      const remaining = Math.max(0, net - (item.montantPaye || 0));
      return sum + remaining;
    }, 0);
  }, [selectedMultiItems, selectedRemiseMulti]);

  const openMultiModal = () => {
    if (!canManagePayments) {
      Alert.alert('Saison requise', 'Créez ou rouvrez une saison avant d’enregistrer un paiement.');
      return;
    }
    if (unpaidPaiements.length === 0) {
      Alert.alert('Info', 'Tous les paiements de la saison sont déjà réglés !');
      return;
    }
    const defaultMois = Math.min(1, unpaidPaiements.length);
    setNbMoisMulti(defaultMois);
    setSelectedRemiseMulti(null);
    setNotesMulti('');
    setIsCustomMontant(false);
    
    const firstItems = unpaidPaiements.slice(0, defaultMois);
    const initialTotal = firstItems.reduce((sum, item) => {
      const net = (item.montantDu || 0) - (item.remiseMontant || 0);
      return sum + Math.max(0, net - (item.montantPaye || 0));
    }, 0);
    
    setMontantAvanceMulti(String(initialTotal));
    setShowMultiModal(true);
  };

  const handleNbMoisChange = (n) => {
    const validN = Math.max(1, Math.min(n, unpaidPaiements.length));
    setNbMoisMulti(validN);
    if (!isCustomMontant) {
      const items = unpaidPaiements.slice(0, validN);
      const total = items.reduce((sum, item) => {
        const remisePct = selectedRemiseMulti ? selectedRemiseMulti.pourcentage : (item.remisePct || 0);
        const remiseMontant = Math.round((item.montantDu || 0) * remisePct / 100);
        const net = (item.montantDu || 0) - remiseMontant;
        return sum + Math.max(0, net - (item.montantPaye || 0));
      }, 0);
      setMontantAvanceMulti(String(total));
    }
  };

  const handleRemiseMultiChange = (remise) => {
    const nextRemise = selectedRemiseMulti?.id === remise?.id ? null : remise;
    setSelectedRemiseMulti(nextRemise);
    if (!isCustomMontant) {
      const items = unpaidPaiements.slice(0, nbMoisMulti);
      const total = items.reduce((sum, item) => {
        const remisePct = nextRemise ? nextRemise.pourcentage : (item.remisePct || 0);
        const remiseMontant = Math.round((item.montantDu || 0) * remisePct / 100);
        const net = (item.montantDu || 0) - remiseMontant;
        return sum + Math.max(0, net - (item.montantPaye || 0));
      }, 0);
      setMontantAvanceMulti(String(total));
    }
  };

  const handleMontantAvanceTextChange = (text) => {
    setMontantAvanceMulti(text);
    setIsCustomMontant(true);
  };

  const resetToExactAmount = () => {
    setMontantAvanceMulti(String(totalDuMulti));
    setIsCustomMontant(false);
  };

  const montantAvanceNum = parseFloat(montantAvanceMulti) || 0;
  const resteAPayerMulti = Math.max(0, totalDuMulti - montantAvanceNum);
  const surplusMulti = Math.max(0, montantAvanceNum - totalDuMulti);

  const handleSaveMultiMonth = async () => {
    if (!canManagePayments) {
      Alert.alert('Saison requise', 'Créez ou rouvrez une saison avant d’enregistrer un paiement.');
      return;
    }
    if (selectedMultiItems.length === 0) {
      Alert.alert('Info', 'Aucun paiement sélectionné.');
      return;
    }
    const cash = parseFloat(montantAvanceMulti);
    if (isNaN(cash) || cash < 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant encaissé valide.');
      return;
    }

    setSavingMulti(true);
    try {
      let remainingCash = cash;
      const todayIso = new Date().toISOString();

      for (const item of selectedMultiItems) {
        const remisePct = selectedRemiseMulti ? selectedRemiseMulti.pourcentage : (item.remisePct || 0);
        const remiseMontant = Math.round((item.montantDu || 0) * remisePct / 100);
        const net = (item.montantDu || 0) - remiseMontant;
        const currentPaye = item.montantPaye || 0;
        const netRemaining = Math.max(0, net - currentPaye);

        const allocated = Math.min(remainingCash, netRemaining);
        const newPaye = currentPaye + allocated;
        remainingCash -= allocated;

        let statut = PAYMENT_STATUS.A_PAYER;
        if (newPaye >= net && net >= 0) {
          statut = PAYMENT_STATUS.PAYE;
        } else if (newPaye > 0) {
          statut = PAYMENT_STATUS.AVANCE;
        } else {
          const dueDate = item.annee && item.mois ? new Date(item.annee, item.mois - 1, 10) : new Date();
          if (new Date() > dueDate) statut = PAYMENT_STATUS.EN_RETARD;
        }

        const noteText = notesMulti ? `[Avance ${selectedMultiItems.length} mois: ${notesMulti}]` : '';

        await updatePaiement({
          ...item,
          montantPaye: newPaye,
          remisePct,
          remiseMontant,
          datePaiement: allocated > 0 ? todayIso : item.datePaiement,
          statut,
          notes: item.notes ? `${item.notes} ${noteText}`.trim() : noteText,
        });
      }

      setShowMultiModal(false);
      await load();
      Alert.alert(
        '✅ Paiement multi-mois enregistré',
        `Mois traités : ${selectedMultiItems.length}\nMontant encaissé : ${cash.toLocaleString()} DA\nReste à payer sur ces mois : ${resteAPayerMulti.toLocaleString()} DA`
      );
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d’enregistrer.');
    } finally {
      setSavingMulti(false);
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
              <Text style={[styles.balanceAmt, { color: COLORS.success }]}>{balance.montantVerse.toLocaleString()}</Text>
              <Text style={styles.balanceLbl}>Montant versé (DA)</Text>
            </View>
            <View style={[styles.divider]} />
            <View style={styles.balanceCol}>
              <Text style={[styles.balanceAmt, { color: balance.resteAVerser > 0 ? COLORS.danger : COLORS.success }]}>
                {balance.resteAVerser.toLocaleString()}
              </Text>
              <Text style={styles.balanceLbl}>Reste à verser (DA)</Text>
            </View>
          </View>

          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border + '50', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: '500' }}>
              Mois ciblés par les versements :
            </Text>
            <View style={{ backgroundColor: COLORS.primary + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full }}>
              <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>
                {balance.nbMoisPayes} / {balance.totalMoisCibles} mois
              </Text>
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

          {/* Bouton Paiement Multi-mois */}
          <TouchableOpacity
            style={[styles.multiPayBtn, !canManagePayments && { opacity: 0.5 }]}
            onPress={openMultiModal}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="calendar-multiselect" size={20} color="#fff" />
            <Text style={styles.multiPayBtnText}>Avancer plusieurs mois ({unpaidPaiements.length} restant{unpaidPaiements.length > 1 ? 's' : ''})</Text>
          </TouchableOpacity>
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

      {/* Single Payment Modal */}
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
              <View style={styles.amtRow}>
                <Text style={styles.amtLabel}>Déjà versé</Text>
                <Text style={[styles.amtValue, { color: COLORS.primary }]}>{(selected?.montantPaye || 0).toLocaleString()} DA</Text>
              </View>
              <View style={[styles.amtRow, styles.amtTotal]}>
                <Text style={[styles.amtLabel, { color: COLORS.textPrimary, fontWeight: '700' }]}>Reste à payer sur ce mois</Text>
                <Text style={[styles.amtValue, { color: COLORS.danger, fontSize: 17 }]}>
                  {Math.max(0,
                    (selected ? selected.montantDu - (selectedRemise ? Math.round(selected.montantDu * selectedRemise.pourcentage / 100) : (selected.remiseMontant || 0)) : 0) - (selected?.montantPaye || 0)
                  ).toLocaleString()} DA
                </Text>
              </View>
            </View>

            {/* Montant payé input */}
            <Text style={styles.modalLabel}>Montant du nouveau versement (DA)</Text>
            <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: -4, marginBottom: 8 }}>
              💡 Si ce versement dépasse le reste à payer, le surplus sera automatiquement déduit des mois suivants.
            </Text>
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

      {/* Multi-Month Advance Payment Modal */}
      <Modal visible={showMultiModal} transparent animationType="slide" onRequestClose={() => setShowMultiModal(false)}>
        <View style={styles.modalBg}>
          <ScrollView contentContainerStyle={styles.multiModalScrollContainer} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <View style={styles.multiHeaderRow}>
                <MaterialCommunityIcons name="calendar-multiselect" size={24} color={COLORS.primary} />
                <Text style={styles.modalTitle}>Avancer plusieurs mois</Text>
              </View>
              <Text style={styles.modalSubtitle}>
                Sélectionnez le nombre de mois à avancer, le montant versé et consultez le reste à payer.
              </Text>

              {/* Counter and Chips for Month Selection */}
              <Text style={styles.modalLabel}>Nombre de mois à avancer</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => handleNbMoisChange(nbMoisMulti - 1)}
                  disabled={nbMoisMulti <= 1}
                >
                  <MaterialCommunityIcons name="minus" size={22} color={nbMoisMulti <= 1 ? COLORS.textMuted : COLORS.primary} />
                </TouchableOpacity>

                <View style={styles.counterDisplay}>
                  <Text style={styles.counterText}>{nbMoisMulti}</Text>
                  <Text style={styles.counterSubText}>mois</Text>
                </View>

                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => handleNbMoisChange(nbMoisMulti + 1)}
                  disabled={nbMoisMulti >= unpaidPaiements.length}
                >
                  <MaterialCommunityIcons name="plus" size={22} color={nbMoisMulti >= unpaidPaiements.length ? COLORS.textMuted : COLORS.primary} />
                </TouchableOpacity>
              </View>

              {/* Quick Chips */}
              <View style={styles.quickChipsRow}>
                {[1, 2, 3, 5, 10, unpaidPaiements.length].filter((val, idx, self) => val <= unpaidPaiements.length && self.indexOf(val) === idx).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.quickChip, nbMoisMulti === n && styles.quickChipActive]}
                    onPress={() => handleNbMoisChange(n)}
                  >
                    <Text style={[styles.quickChipText, nbMoisMulti === n && { color: COLORS.primary }]}>
                      {n === unpaidPaiements.length ? `Tout (${n} m.)` : `${n} m.`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preview of included items */}
              <Text style={styles.modalLabel}>Mois inclus dans ce versement :</Text>
              <View style={styles.includedItemsBox}>
                {selectedMultiItems.map((item, idx) => (
                  <View key={item.id} style={styles.includedItemChip}>
                    <Text style={styles.includedItemNum}>{idx + 1}</Text>
                    <Text style={styles.includedItemText}>{item.label}</Text>
                  </View>
                ))}
              </View>

              {/* Remise Multi */}
              <Text style={styles.modalLabel}>Remise globale (optionnelle)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.remiseChip, !selectedRemiseMulti && styles.remiseChipActive]}
                    onPress={() => handleRemiseMultiChange(null)}
                  >
                    <Text style={[styles.remiseText, !selectedRemiseMulti && { color: COLORS.primary }]}>Aucune</Text>
                  </TouchableOpacity>
                  {remises.map(r => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.remiseChip, selectedRemiseMulti?.id === r.id && styles.remiseChipActive]}
                      onPress={() => handleRemiseMultiChange(r)}
                    >
                      <Text style={[styles.remiseText, selectedRemiseMulti?.id === r.id && { color: COLORS.primary }]}>
                        {r.label} ({r.pourcentage}%)
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Montant Avancé Input */}
              <View style={styles.inputHeaderRow}>
                <Text style={styles.modalLabel}>Montant avancé / versé par l'adhérent (DA)</Text>
                {isCustomMontant && (
                  <TouchableOpacity onPress={resetToExactAmount} style={styles.resetAmountBtn}>
                    <MaterialCommunityIcons name="refresh" size={14} color={COLORS.primary} />
                    <Text style={styles.resetAmountText}>Montant exact</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[styles.modalInput, { fontSize: 18, fontWeight: '700', color: COLORS.primary }]}
                value={montantAvanceMulti}
                onChangeText={handleMontantAvanceTextChange}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
              />

              {/* Real-time Summary Card */}
              <View style={styles.multiSummaryCard}>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Total dû ({nbMoisMulti} mois) :</Text>
                  <Text style={styles.summaryValue}>{totalDuMulti.toLocaleString()} DA</Text>
                </View>

                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Montant versé :</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.success }]}>
                    {montantAvanceNum.toLocaleString()} DA
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryLine}>
                  <Text style={[styles.summaryLabel, { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 }]}>
                    Reste à payer :
                  </Text>
                  <Text style={[styles.summaryValue, { color: resteAPayerMulti > 0 ? COLORS.warning : COLORS.success, fontSize: 18, fontWeight: '900' }]}>
                    {resteAPayerMulti.toLocaleString()} DA
                  </Text>
                </View>

                {surplusMulti > 0 && (
                  <View style={styles.surplusBox}>
                    <MaterialCommunityIcons name="gift-outline" size={16} color={COLORS.secondary} />
                    <Text style={styles.surplusText}>
                      Surplus versé : +{surplusMulti.toLocaleString()} DA (couvrira les mois suivants)
                    </Text>
                  </View>
                )}
              </View>

              {/* Notes */}
              <Text style={styles.modalLabel}>Notes (optionnel)</Text>
              <TextInput
                style={[styles.modalInput, { height: 60 }]}
                value={notesMulti}
                onChangeText={setNotesMulti}
                placeholder="Remarques (ex: Avance 5 mois par chèque)..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowMultiModal(false)}>
                  <Text style={styles.cancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMultiMonth} disabled={savingMulti}>
                  <MaterialCommunityIcons name="check-decagram" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>{savingMulti ? 'Enregistrement...' : 'Valider le versement'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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

  // Multi-month styles
  multiPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  multiPayBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  multiModalScrollContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  multiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: COLORS.bgInput,
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  counterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  counterDisplay: {
    alignItems: 'center',
    minWidth: 60,
  },
  counterText: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  counterSubText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  quickChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  includedItemsBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: COLORS.bgInput,
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  includedItemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  includedItemNum: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  includedItemText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },
  inputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resetAmountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetAmountText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  multiSummaryCard: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  summaryValue: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  surplusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.secondary + '15',
    padding: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.secondary + '30',
    marginTop: 2,
  },
  surplusText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
});
