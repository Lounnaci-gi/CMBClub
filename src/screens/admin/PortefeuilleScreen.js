// src/screens/admin/PortefeuilleScreen.js
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import {
  fetchPortefeuilleComplet,
  enregistrerVersement,
  setTarifPersonnalise,
  setReductionAdherent,
  estimerPaiementGroupe,
} from '../../database/portefeuilleDb';
import {
  CREANCE_STATUS,
  CREANCE_TYPES,
  getStatusLabel,
} from '../../services/portefeuilleService';
import { printAdherentCotisations } from '../../utils/printAdherentCotisations';
import { getPaiementsByAdherent } from '../../database/database';

function statusColor(statut, COLORS) {
  switch (statut) {
    case CREANCE_STATUS.PAYE: return COLORS.success;
    case CREANCE_STATUS.PARTIEL: return COLORS.primary;
    case CREANCE_STATUS.PAYE_AVANCE: return COLORS.secondary;
    case CREANCE_STATUS.NON_PAYE: return COLORS.danger;
    default: return COLORS.textMuted;
  }
}

function statusIcon(statut) {
  switch (statut) {
    case CREANCE_STATUS.PAYE: return 'check-circle';
    case CREANCE_STATUS.PARTIEL: return 'circle-half-full';
    case CREANCE_STATUS.PAYE_AVANCE: return 'calendar-check';
    case CREANCE_STATUS.NON_PAYE: return 'close-circle';
    default: return 'help-circle';
  }
}

export default function PortefeuilleScreen({ route }) {
  const { adherentId } = route.params;
  const { adherents, saisonActive, config } = useStore();
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const adherent = adherents.find((a) => a.id === adherentId);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [montant, setMontant] = useState('');
  const [saving, setSaving] = useState(false);

  const [showTarifModal, setShowTarifModal] = useState(false);
  const [tarifInput, setTarifInput] = useState('');
  const [showDerogModal, setShowDerogModal] = useState(false);
  const [derogPct, setDerogPct] = useState('');
  const [derogMin, setDerogMin] = useState('1');
  const [nbMoisGroupe, setNbMoisGroupe] = useState('3');
  const [estimeGroupe, setEstimeGroupe] = useState(null);

  const load = useCallback(async () => {
    if (!adherentId || !saisonActive?.id) return;
    setLoading(true);
    try {
      const full = await fetchPortefeuilleComplet(adherentId, saisonActive.id);
      setData(full);
      setTarifInput(full.tarifPerso ? String(full.tarifPerso.montantMensuel) : '');
      setDerogPct(full.reductionAdherent ? String(full.reductionAdherent.reductionPct) : '');
      setDerogMin(full.reductionAdherent ? String(full.reductionAdherent.nbMoisMin || 1) : '1');
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [adherentId, saisonActive?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleVersement = async () => {
    const m = parseFloat(montant);
    if (isNaN(m) || m <= 0) {
      Alert.alert('Erreur', 'Montant invalide');
      return;
    }
    setSaving(true);
    try {
      await enregistrerVersement({
        adherentId,
        saisonId: saisonActive.id,
        montant: m,
      });
      setMontant('');
      await load();
      Alert.alert('Versement enregistré', 'Imputation automatique effectuée.');
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Échec du versement');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTarif = async () => {
    try {
      const val = tarifInput.trim() === '' ? null : parseFloat(tarifInput);
      if (val != null && (isNaN(val) || val < 0)) {
        Alert.alert('Erreur', 'Tarif invalide');
        return;
      }
      await setTarifPersonnalise(adherentId, saisonActive.id, val);
      setShowTarifModal(false);
      await load();
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const handleSaveDerog = async () => {
    try {
      const pct = derogPct.trim() === '' ? null : parseFloat(derogPct);
      if (pct != null && (isNaN(pct) || pct <= 0 || pct >= 100)) {
        Alert.alert('Erreur', 'Pourcentage entre 1 et 99');
        return;
      }
      await setReductionAdherent(adherentId, saisonActive.id, {
        nbMoisMin: parseInt(derogMin, 10) || 1,
        reductionPct: pct,
      });
      setShowDerogModal(false);
      await load();
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const handleEstimeGroupe = async () => {
    const n = parseInt(nbMoisGroupe, 10);
    if (!n || n < 1) {
      Alert.alert('Erreur', 'Nombre de mois invalide');
      return;
    }
    const estim = await estimerPaiementGroupe(adherentId, saisonActive.id, n);
    setEstimeGroupe(estim);
  };

  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    if (!adherent || !saisonActive) return;
    setPrinting(true);
    try {
      const paiements = await getPaiementsByAdherent(adherent.id, saisonActive.id);
      await printAdherentCotisations({
        adherent,
        saison: saisonActive,
        paiements,
        config,
      });
    } catch (e) {
      Alert.alert('Erreur', e.message || "Erreur lors de l'impression");
    } finally {
      setPrinting(false);
    }
  };

  if (!saisonActive) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Aucune saison active</Text>
      </View>
    );
  }

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const resume = data?.resume || { totalDu: 0, totalVerse: 0, soldeRestant: 0 };
  const detail = data?.detailMensuel || [];
  const creancesFixes = (data?.creances || []).filter(
    (c) => c.type === CREANCE_TYPES.INSCRIPTION || c.type === CREANCE_TYPES.ASSURANCE,
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroName}>
            {adherent ? `${adherent.prenom} ${adherent.nom}` : 'Portefeuille'}
          </Text>
          <Text style={styles.heroSub}>Saison {saisonActive.label}</Text>
        </View>
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: COLORS.primary + '18',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: RADIUS.full,
            borderWidth: 1,
            borderColor: COLORS.primary + '40',
          }}
          onPress={handlePrint}
          disabled={printing}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="printer" size={16} color={COLORS.primary} />
          <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
            {printing ? 'Impression…' : 'Imprimer'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Résumé */}
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Résumé</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total dû</Text>
            <Text style={styles.summaryValue}>{resume.totalDu.toLocaleString()} DA</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total versé</Text>
            <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
              {resume.totalVerse.toLocaleString()} DA
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Solde restant</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: resume.soldeRestant > 0 ? COLORS.danger : COLORS.success },
              ]}
            >
              {resume.soldeRestant.toLocaleString()} DA
            </Text>
          </View>
        </View>
        <Text style={styles.hint}>
          Dû = créances depuis le début de saison jusqu&apos;au mois courant
        </Text>
      </View>

      {/* Versement libre */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Nouveau versement</Text>
        <Text style={styles.hint}>
          Crédit portefeuille · imputation auto : inscription → mensualités (ancien→récent) → avance
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={montant}
            onChangeText={setMontant}
            keyboardType="numeric"
            placeholder="Montant (DA)"
            placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={handleVersement}
            disabled={saving}
          >
            <Text style={styles.primaryBtnText}>{saving ? '…' : 'Enregistrer'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Créances fixes */}
      {creancesFixes.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Inscription & assurance</Text>
          {creancesFixes.map((c) => {
            const color = statusColor(c.statut, COLORS);
            return (
              <View key={c.id} style={styles.monthRow}>
                <MaterialCommunityIcons name={statusIcon(c.statut)} size={20} color={color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.monthLabel}>{c.label}</Text>
                  <Text style={styles.monthMeta}>
                    {(c.montantPaye || 0).toLocaleString()} / {c.montantDu.toLocaleString()} DA
                  </Text>
                </View>
                <Text style={[styles.badge, { color, borderColor: color }]}>
                  {getStatusLabel(c.statut)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Détail mensuel */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Détail mensuel</Text>
        {detail.length === 0 ? (
          <Text style={styles.emptyText}>Aucune mensualité</Text>
        ) : (
          detail.map((m) => {
            const color = statusColor(m.statut, COLORS);
            return (
              <View key={`${m.annee}-${m.mois}`} style={styles.monthRow}>
                <MaterialCommunityIcons name={statusIcon(m.statut)} size={20} color={color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.monthLabel}>{m.label}</Text>
                  <Text style={styles.monthMeta}>
                    {(m.montantPaye || 0).toLocaleString()} / {(m.montantDu || 0).toLocaleString()} DA
                  </Text>
                </View>
                <Text style={[styles.badge, { color, borderColor: color }]}>
                  {getStatusLabel(m.statut)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Tarif perso & dérogation */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Tarification saison</Text>
        <Text style={styles.hint}>
          Tarif de base : {(config?.fraisMensuel || 1500).toLocaleString()} DA/mois · personnalisé
          valable uniquement pour {saisonActive.label}
        </Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowTarifModal(true)}>
            <MaterialCommunityIcons name="tag" size={16} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>
              {data?.tarifPerso
                ? `Perso ${data.tarifPerso.montantMensuel} DA`
                : 'Tarif personnalisé'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowDerogModal(true)}>
            <MaterialCommunityIcons name="percent" size={16} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>
              {data?.reductionAdherent
                ? `Dérog. -${data.reductionAdherent.reductionPct}%`
                : 'Dérogation multi-mois'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Paiement groupé</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 0.4 }]}
            value={nbMoisGroupe}
            onChangeText={setNbMoisGroupe}
            keyboardType="numeric"
            placeholder="Mois"
            placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleEstimeGroupe}>
            <Text style={styles.secondaryBtnText}>Estimer</Text>
          </TouchableOpacity>
        </View>
        {estimeGroupe ? (
          <Text style={styles.estimeText}>
            {estimeGroupe.nbMois} mois · brut {estimeGroupe.montantBrut.toLocaleString()} DA →{' '}
            <Text style={{ fontWeight: '800', color: COLORS.success }}>
              {estimeGroupe.montantFinal.toLocaleString()} DA
            </Text>
            {' '}({estimeGroupe.sourceAppliquee}, -{estimeGroupe.reductionPctAppliquee}%)
          </Text>
        ) : null}
      </View>

      {/* Historique versements */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Versements</Text>
        {(data?.versements || []).length === 0 ? (
          <Text style={styles.emptyText}>Aucun versement</Text>
        ) : (
          data.versements.map((v) => (
            <View key={v.id} style={styles.monthRow}>
              <MaterialCommunityIcons name="cash" size={18} color={COLORS.primary} />
              <Text style={[styles.monthLabel, { flex: 1 }]}>{v.dateVersement}</Text>
              <Text style={[styles.summaryValue, { fontSize: 14 }]}>
                +{Number(v.montant).toLocaleString()} DA
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Modals */}
      <Modal visible={showTarifModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.sectionTitle}>Tarif mensuel personnalisé</Text>
            <Text style={styles.hint}>Laisser vide pour revenir au tarif de base. Non reconduit à la saison suivante.</Text>
            <TextInput
              style={styles.input}
              value={tarifInput}
              onChangeText={setTarifInput}
              keyboardType="numeric"
              placeholder={`Base ${(config?.fraisMensuel || 1500)} DA`}
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowTarifModal(false)}>
                <Text style={styles.secondaryBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveTarif}>
                <Text style={styles.primaryBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDerogModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.sectionTitle}>Dérogation multi-mois</Text>
            <Text style={styles.hint}>Réduction spécifique à cet adhérent pour la saison en cours. Vide = désactiver.</Text>
            <Text style={styles.fieldLabel}>Réduction (%)</Text>
            <TextInput
              style={styles.input}
              value={derogPct}
              onChangeText={setDerogPct}
              keyboardType="numeric"
              placeholder="ex. 15"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.fieldLabel}>À partir de (mois)</Text>
            <TextInput
              style={styles.input}
              value={derogMin}
              onChangeText={setDerogMin}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShowDerogModal(false)}>
                <Text style={styles.secondaryBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveDerog}>
                <Text style={styles.primaryBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function createStyles(COLORS, RADIUS, SHADOWS) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    content: { padding: 16, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
    heroName: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
    heroSub: { fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
    summaryCard: {
      backgroundColor: COLORS.bgCard,
      borderRadius: RADIUS.lg,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: COLORS.primary + '40',
      ...SHADOWS?.sm,
    },
    card: {
      backgroundColor: COLORS.bgCard,
      borderRadius: RADIUS.lg,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryItem: { flex: 1 },
    summaryLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
    summaryValue: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
    hint: { fontSize: 12, color: COLORS.textMuted, marginBottom: 10, lineHeight: 16 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
      flex: 1,
      backgroundColor: COLORS.bgInput,
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: COLORS.textPrimary,
      borderWidth: 1,
      borderColor: COLORS.border,
      marginBottom: 8,
    },
    primaryBtn: {
      backgroundColor: COLORS.primary,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: COLORS.primary + '50',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    secondaryBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 12 },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: COLORS.border,
    },
    monthLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
    monthMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
    badge: {
      fontSize: 11,
      fontWeight: '700',
      borderWidth: 1,
      borderRadius: RADIUS.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    emptyText: { color: COLORS.textMuted, fontSize: 13 },
    estimeText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
    fieldLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 24,
    },
    modalBox: {
      backgroundColor: COLORS.bgModal,
      borderRadius: RADIUS.lg,
      padding: 18,
      borderWidth: 1,
      borderColor: COLORS.border,
    },
  });
}
