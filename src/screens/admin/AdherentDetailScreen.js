// src/screens/admin/AdherentDetailScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import useStore from '../../store/useStore';
import CategoryBadge from '../../components/CategoryBadge';
import PaymentCard from '../../components/PaymentCard';
import AdherentCardModal from '../../components/AdherentCardModal';
import useTheme from '../../theme/useTheme';
import { getCategoryByAge, getEffectiveCategory, calculateAge } from '../../utils/categories';
import { calculateBalance, generatePaymentSchedule, PAYMENT_STATUS } from '../../utils/payments';
import { formatDate } from '../../utils/seasons';
import {
  getPaiementsByAdherent,
  getUserByAdherentId,
  ensureAdherentAccount,
  updateUserPassword,
  isAdherentEnrolled,
  refreshPaymentStatuses,
} from '../../database/database';
import { printAdherentCotisations } from '../../utils/printAdherentCotisations';

export default function AdherentDetailScreen({ navigation, route }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { adherentId } = route.params;
  const {
    adherents, saisonActive, deleteAdherent, enrollAdherent, toggleAdherentAssure,
    createPaiement, config, loadConfig, getPresencesAdherent,
  } = useStore();
  const [paiements, setPaiements] = useState([]);
  const [presencesData, setPresencesData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [account, setAccount] = useState(null);
  const [enrolled, setEnrolled] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);

  const adherent = adherents.find(a => a.id === adherentId);

  const handlePrintCotisations = async () => {
    if (!adherent || !saisonActive) return;
    setPrinting(true);
    try {
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

  const loadPaiements = useCallback(async () => {
    if (!adherent) return;
    await loadConfig();
    const user = await getUserByAdherentId(adherent.id);
    setAccount(user);
    if (saisonActive) {
      setEnrolled(await isAdherentEnrolled(adherent.id, saisonActive.id));
      await refreshPaymentStatuses(saisonActive.id);
      const p = await getPaiementsByAdherent(adherent.id, saisonActive.id);
      setPaiements(p);
    }
    const pres = await getPresencesAdherent(adherent.id, saisonActive?.id);
    setPresencesData(pres);
  }, [adherent, saisonActive, loadConfig, getPresencesAdherent]);

  useFocusEffect(useCallback(() => { loadPaiements(); }, [loadPaiements]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPaiements();
    setRefreshing(false);
  };

  if (!adherent) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Adhérent introuvable</Text>
      </View>
    );
  }

  const cat = getEffectiveCategory(adherent);
  const age = calculateAge(adherent.dateNaissance);
  const balance = calculateBalance(paiements);
  const defaultPassword = (adherent.dateNaissance || '').replace(/-/g, '').slice(2);

  const handleDelete = () => {
    Alert.alert(
      'Supprimer l\'adhérent',
      `Supprimer ${adherent.prenom} ${adherent.nom} ? Action irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteAdherent(adherent.id);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const handleCreateAccount = async () => {
    const { password, created } = await ensureAdherentAccount(adherent);
    await loadPaiements();
    Alert.alert(
      created ? 'Compte créé' : 'Compte existant',
      created
        ? `Identifiant : ${adherent.code}\nMot de passe : ${password}`
        : `Identifiant : ${adherent.code}`,
    );
  };

  const handleResetPassword = () => {
    if (!account) return;
    Alert.alert(
      'Réinitialiser le mot de passe',
      `Remettre le mot de passe à la date de naissance (${defaultPassword}) ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          onPress: async () => {
            await updateUserPassword(account.id, defaultPassword);
            Alert.alert('Mot de passe réinitialisé', `Nouveau mot de passe : ${defaultPassword}`);
          },
        },
      ],
    );
  };

  const handleToggleAssure = async () => {
    if (!saisonActive) return;
    try {
      await toggleAdherentAssure(adherent.id, Boolean(adherent.assure), saisonActive.id);
      await loadPaiements();
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de modifier le statut d\'assurance.');
    }
  };

  const handleEnrollSeason = () => {
    if (!saisonActive) {
      Alert.alert('Erreur', 'Aucune saison active');
      return;
    }
    Alert.alert(
      'Réinscrire à la saison',
      `Inscrire / réinscrire ${adherent.prenom} à la saison ${saisonActive.label} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Inscrire',
          onPress: async () => {
            const today = new Date().toISOString();
            await enrollAdherent(adherent.id, saisonActive.id, today, adherent.assure ? 1 : 0);
            await loadPaiements();
            Alert.alert('Inscription effectuée', `Adhérent réinscrit avec succès pour la saison ${saisonActive.label}`);
          },
        },
      ],
    );
  };

  const InfoRow = ({ icon, label, value, valueColor }) => (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={16} color={COLORS.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value || '-'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <LinearGradient colors={[cat.color + '30', COLORS.bg]} style={styles.hero}>
          <View style={styles.photoContainer}>
            {adherent.photo ? (
              <Image source={{ uri: adherent.photo }} style={styles.photo} />
            ) : (
              <View style={[styles.photoPlaceholder, { backgroundColor: cat.color + '20' }]}>
                <Text style={{ fontSize: 40 }}>{cat.icon}</Text>
              </View>
            )}
            <View style={styles.codeBadge}>
              <Text style={styles.codeText}>{adherent.code}</Text>
            </View>
          </View>

          <Text style={styles.fullName}>{adherent.prenom} {adherent.nom}</Text>
          <CategoryBadge category={cat.label} />
          <Text style={styles.ageText}>{age} ans · {adherent.genre === 'F' ? 'Féminin' : 'Masculin'}</Text>

          {adherent.discipline ? (
            <View style={styles.disciplineBadge}>
              <MaterialCommunityIcons name="run-fast" size={14} color={COLORS.primary} />
              <Text style={styles.disciplineText}>{adherent.discipline}</Text>
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('AdherentForm', { adherentId: adherent.id })}
          >
            <MaterialCommunityIcons name="pencil" size={18} color={COLORS.primary} />
            <Text style={[styles.actionText, { color: COLORS.primary }]}>Modifier</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: COLORS.primary + '50' }]}
            onPress={() => setShowCardModal(true)}
          >
            <MaterialCommunityIcons name="badge-account-horizontal" size={18} color={COLORS.primary} />
            <Text style={[styles.actionText, { color: COLORS.primary }]}>Carte</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: COLORS.success + '40' }]}
            onPress={() => navigation.navigate('PaymentDetail', { adherentId: adherent.id })}
          >
            <MaterialCommunityIcons name="cash" size={18} color={COLORS.success} />
            <Text style={[styles.actionText, { color: COLORS.success }]}>Paiements</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: COLORS.danger + '40' }]}
            onPress={handleDelete}
          >
            <MaterialCommunityIcons name="trash-can" size={18} color={COLORS.danger} />
            <Text style={[styles.actionText, { color: COLORS.danger }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>

        {!enrolled && saisonActive ? (
          <View style={[styles.card, { borderColor: COLORS.warning, backgroundColor: COLORS.warning + '12' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={COLORS.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 }}>
                  Non inscrit pour la saison {saisonActive.label}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Cet adhérent doit être réinscrit pour démarrer la nouvelle saison.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={{
                marginTop: 12,
                backgroundColor: COLORS.primary,
                borderRadius: RADIUS.md,
                paddingVertical: 12,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={handleEnrollSeason}
            >
              <MaterialCommunityIcons name="account-plus-outline" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>
                Réinscrire pour la saison {saisonActive.label}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informations personnelles</Text>
          <InfoRow icon="cake" label="Date de naissance" value={formatDate(adherent.dateNaissance)} />
          <InfoRow icon="map-marker" label="Lieu de naissance" value={adherent.lieuNaissance} />
          <InfoRow icon="phone" label="Téléphone" value={adherent.telephone} />
          <InfoRow icon="human-male-height" label="Taille" value={adherent.taille ? `${adherent.taille} cm` : '-'} />
          <InfoRow icon="water" label="Groupe sanguin" value={adherent.groupeSanguin} />
          <InfoRow icon="calendar-account" label="Date d'inscription" value={formatDate(adherent.dateInscription || adherent.createdAt?.slice(0, 10))} />
          <TouchableOpacity onPress={handleToggleAssure} activeOpacity={0.7}>
            <InfoRow
              icon="shield-check"
              label={`Assurance (${saisonActive ? saisonActive.label : 'Saison'})`}
              value={adherent.assure ? 'Assuré 🛡️' : 'Non assuré ❌'}
              valueColor={adherent.assure ? COLORS.success : COLORS.danger}
            />
          </TouchableOpacity>
        </View>


        {adherent.observationsMedicales ? (
          <View style={[styles.card, { borderColor: COLORS.warning + '30' }]}>
            <View style={styles.cardTitleRow}>
              <MaterialCommunityIcons name="medical-bag" size={16} color={COLORS.warning} />
              <Text style={[styles.cardTitle, { color: COLORS.warning }]}>Observations médicales</Text>
            </View>
            <Text style={styles.obsText}>{adherent.observationsMedicales}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Compte espace adhérent</Text>
          <InfoRow icon="account-key" label="Identifiant" value={adherent.code} />
          <InfoRow icon="shield-account" label="Statut" value={account ? 'Compte actif' : 'Pas de compte'} />
          <View style={styles.accountActions}>
            {!account ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleCreateAccount}>
                <MaterialCommunityIcons name="account-plus" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Créer le compte</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleResetPassword}>
                <MaterialCommunityIcons name="lock-reset" size={16} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>Réinit. mot de passe</Text>
              </TouchableOpacity>
            )}
            {saisonActive && !enrolled ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleEnrollSeason}>
                <MaterialCommunityIcons name="calendar-plus" size={16} color={COLORS.secondary} />
                <Text style={[styles.secondaryBtnText, { color: COLORS.secondary }]}>
                  Inscrire {saisonActive.label}
                </Text>
              </TouchableOpacity>
            ) : null}
            {saisonActive && enrolled ? (
              <View style={styles.enrolledBadge}>
                <MaterialCommunityIcons name="check-circle" size={14} color={COLORS.success} />
                <Text style={styles.enrolledText}>Inscrit {saisonActive.label}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {saisonActive ? (
          <View style={[styles.card, { borderColor: COLORS.primary + '30' }]}>
            <Text style={styles.cardTitle}>Bilan financier – {saisonActive.label}</Text>
            <View style={styles.balanceGrid}>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Total dû</Text>
                <Text style={styles.balanceValue}>{balance.totalDu.toLocaleString()} DA</Text>
              </View>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Montant versé</Text>
                <Text style={[styles.balanceValue, { color: COLORS.primary }]}>{balance.montantVerse.toLocaleString()} DA</Text>
              </View>
              <View style={[styles.balanceItem, { backgroundColor: (balance.resteAVerser > 0 ? COLORS.danger : COLORS.success) + '15', borderRadius: RADIUS.md }]}>
                <Text style={styles.balanceLabel}>Reste à verser</Text>
                <Text style={[styles.balanceValue, { color: balance.resteAVerser > 0 ? COLORS.danger : COLORS.success }]}>
                  {balance.resteAVerser.toLocaleString()} DA
                </Text>
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

            {enrolled && balance.resteAVerser > 0 ? (
              <TouchableOpacity
                style={{
                  marginTop: 14,
                  backgroundColor: COLORS.primary,
                  borderRadius: RADIUS.md,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                }}
                onPress={() => navigation.navigate('PaymentDetail', { adherentId: adherent.id })}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="cash-plus" size={18} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>
                  Ajouter un versement / Avancer des cotisations
                </Text>
              </TouchableOpacity>
            ) : null}

            {enrolled ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.bgInput,
                    borderRadius: RADIUS.md,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                    borderWidth: 1,
                    borderColor: COLORS.primary + '40',
                  }}
                  onPress={() => navigation.navigate('Portefeuille', { adherentId: adherent.id })}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="wallet" size={17} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
                    Portefeuille
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.primary + '15',
                    borderRadius: RADIUS.md,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                    borderWidth: 1,
                    borderColor: COLORS.primary + '40',
                  }}
                  onPress={handlePrintCotisations}
                  disabled={printing}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="printer" size={17} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>
                    {printing ? 'Impression…' : 'Imprimer'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {presencesData ? (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardTitle}>Assiduité & Présences</Text>
              <View style={{ backgroundColor: (presencesData.tauxPresence >= 80 ? COLORS.success : presencesData.tauxPresence >= 50 ? COLORS.warning : COLORS.danger) + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full }}>
                <Text style={{ color: presencesData.tauxPresence >= 80 ? COLORS.success : presencesData.tauxPresence >= 50 ? COLORS.warning : COLORS.danger, fontWeight: '800', fontSize: 13 }}>
                  {presencesData.tauxPresence}%
                </Text>
              </View>
            </View>
            <View style={styles.balanceGrid}>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Présent(s)</Text>
                <Text style={[styles.balanceValue, { color: COLORS.success }]}>{presencesData.nbPresents}</Text>
              </View>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Absent(s)</Text>
                <Text style={[styles.balanceValue, { color: COLORS.danger }]}>{presencesData.nbAbsents}</Text>
              </View>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Retard(s)</Text>
                <Text style={[styles.balanceValue, { color: COLORS.warning }]}>{presencesData.nbRetards}</Text>
              </View>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceLabel}>Excusé(s)</Text>
                <Text style={[styles.balanceValue, { color: COLORS.secondary }]}>{presencesData.nbExcuses}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {paiements.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Paiements en cours</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PaymentDetail', { adherentId: adherent.id })}>
                <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '600' }}>Voir tout</Text>
              </TouchableOpacity>
            </View>
            {paiements.slice(0, 4).map(p => (
              <PaymentCard
                key={p.id}
                paiement={p}
                onPress={() => navigation.navigate('PaymentDetail', { adherentId: adherent.id })}
              />
            ))}
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      <AdherentCardModal
        visible={showCardModal}
        adherent={adherent}
        onClose={() => setShowCardModal(false)}
      />
    </View>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 20,
    gap: 10,
  },
  photoContainer: { position: 'relative', marginBottom: 4 },
  photo: { width: 100, height: 130, borderRadius: RADIUS.lg, resizeMode: 'cover' },
  photoPlaceholder: {
    width: 100,
    height: 130,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBadge: {
    position: 'absolute',
    bottom: -8,
    right: -12,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: 160,
  },
  codeText: { color: '#fff', fontWeight: '700', fontSize: 10 },
  fullName: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 8 },
  ageText: { color: COLORS.textSecondary, fontSize: 14 },
  disciplineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  disciplineText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionText: { fontWeight: '600', fontSize: 13 },
  card: {
    backgroundColor: COLORS.bgCard,
    margin: 16,
    marginTop: 0,
    marginBottom: 12,
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardTitle: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: { color: COLORS.textMuted, fontSize: 13, flex: 1 },
  infoValue: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  obsText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 },
  accountActions: { gap: 8, marginTop: 4 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  enrolledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  enrolledText: { color: COLORS.success, fontWeight: '600', fontSize: 13 },
  balanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  balanceItem: {
    flex: 1,
    minWidth: '45%',
    padding: 10,
    gap: 4,
  },
  balanceLabel: { color: COLORS.textMuted, fontSize: 12 },
  balanceValue: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  errorText: { color: COLORS.danger, textAlign: 'center', marginTop: 40 },
});
