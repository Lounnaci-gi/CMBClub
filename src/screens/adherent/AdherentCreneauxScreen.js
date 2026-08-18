// src/screens/adherent/AdherentCreneauxScreen.js
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import {
  getAdherentById,
  createNotifAbsence,
  deleteNotifAbsence,
  getNotifAbsencesByAdherent,
} from '../../database/database';
import { getEffectiveCategory } from '../../utils/categories';
import { getLocalDateString, getDateForJour } from '../../utils/creneaux';

const JOURS_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export default function AdherentCreneauxScreen() {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { user, creneaux, loadCreneaux } = useStore();

  const [adherent, setAdherent] = useState(null);
  const [showAll, setShowAll]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Notifications déjà envoyées par l'adhérent : Map creneauId+date → notif
  const [sentNotifs, setSentNotifs] = useState({}); // key: `${creneauId}_${date}`

  // Modal de signalement
  const [modalVisible, setModalVisible]   = useState(false);
  const [modalCreneau, setModalCreneau]   = useState(null); // créneau ciblé
  const [modalDate, setModalDate]         = useState('');
  const [modalMessage, setModalMessage]   = useState('');
  const [sending, setSending]             = useState(false);

  const load = useCallback(async () => {
    await loadCreneaux();
    if (user?.adherentId) {
      const a = await getAdherentById(user.adherentId);
      setAdherent(a);
      // Charger les notifications déjà envoyées
      const notifs = await getNotifAbsencesByAdherent(user.adherentId);
      const map = {};
      notifs.forEach(n => { map[`${n.creneauId}_${n.dateSeance}`] = n; });
      setSentNotifs(map);
    }
  }, [user?.adherentId, loadCreneaux]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cat = adherent ? getEffectiveCategory(adherent) : null;

  const myCreneaux = useMemo(() => {
    if (!adherent) return creneaux;
    return creneaux.filter(c => {
      const matchDisc = !adherent.discipline || c.discipline.toLowerCase() === adherent.discipline.toLowerCase();
      const slotCats = (c.categorie || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const matchCat = !cat ||
        slotCats.length === 0 ||
        slotCats.includes('tout') ||
        slotCats.includes('toutes') ||
        slotCats.includes(cat.label.toLowerCase());
      return matchDisc && matchCat;
    });
  }, [creneaux, adherent, cat]);

  const displayed = showAll ? creneaux : myCreneaux;

  const grouped = useMemo(() => {
    const map = {};
    displayed.forEach(c => {
      if (!map[c.jour]) map[c.jour] = [];
      map[c.jour].push(c);
    });
    return JOURS_ORDER.filter(j => map[j]?.length > 0).map(j => ({ jour: j, list: map[j] }));
  }, [displayed]);

  // Ouvrir le modal de signalement pour un créneau
  const openModal = (creneau) => {
    const dateProchaine = getDateForJour(creneau.jour);
    setModalCreneau(creneau);
    setModalDate(dateProchaine);
    setModalMessage('');
    setModalVisible(true);
  };

  // Envoyer la notification d'absence
  const handleSend = async () => {
    if (!adherent || !modalCreneau) return;
    setSending(true);
    try {
      await createNotifAbsence({
        adherentId: adherent.id,
        creneauId: modalCreneau.id,
        dateSeance: modalDate,
        message: modalMessage.trim(),
      });
      // Mettre à jour le state local
      const key = `${modalCreneau.id}_${modalDate}`;
      setSentNotifs(prev => ({
        ...prev,
        [key]: { creneauId: modalCreneau.id, dateSeance: modalDate, message: modalMessage.trim() },
      }));
      setModalVisible(false);
      Alert.alert('✅ Signalement envoyé', "L'administrateur a été notifié de votre absence.");
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d\'envoyer la notification.');
    } finally {
      setSending(false);
    }
  };

  // Annuler un signalement déjà envoyé
  const handleCancel = async (creneau, date) => {
    Alert.alert(
      'Annuler le signalement',
      'Voulez-vous annuler votre signalement d\'absence pour ce créneau ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNotifAbsence(adherent.id, creneau.id, date);
              const key = `${creneau.id}_${date}`;
              setSentNotifs(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
              });
            } catch (e) {
              Alert.alert('Erreur', e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {showAll ? 'Tous les créneaux' : 'Mes créneaux'}
          </Text>
          {adherent && !showAll && (
            <Text style={styles.headerSub}>
              {adherent.discipline} · {cat?.label}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowAll(!showAll)}>
          <MaterialCommunityIcons
            name={showAll ? 'account-filter' : 'calendar-multiple'}
            size={15}
            color={COLORS.primary}
          />
          <Text style={styles.toggleBtnText}>{showAll ? 'Mes créneaux' : 'Tout voir'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {grouped.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="calendar-clock" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Aucun créneau</Text>
            <Text style={styles.emptyText}>
              {showAll
                ? 'Aucun créneau configuré au club.'
                : `Aucun créneau pour ${adherent?.discipline || 'votre discipline'} (${cat?.label || 'votre catégorie'}).`}
            </Text>
          </View>
        ) : (
          grouped.map(group => (
            <View key={group.jour} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <MaterialCommunityIcons name="calendar-today" size={16} color={COLORS.primary} />
                <Text style={styles.dayTitle}>{group.jour}</Text>
                <View style={styles.dayCountBadge}>
                  <Text style={styles.dayCountText}>
                    {group.list.length} créneau{group.list.length > 1 ? 'x' : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.slotList}>
                {group.list.map((c, idx) => {
                  const date = getDateForJour(c.jour);
                  const notifKey = `${c.id}_${date}`;
                  const notifSent = sentNotifs[notifKey];

                  return (
                    <View key={c.id} style={styles.slotItem}>
                      <View style={styles.slotIconBox}>
                        <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.secondary} />
                      </View>
                      <View style={styles.slotInfo}>
                        <View style={styles.slotTitleRow}>
                          <Text style={styles.slotTime}>{c.heureDebut} – {c.heureFin}</Text>
                          {group.list.length > 1 && (
                            <Text style={styles.seanceTag}>Séance {idx + 1}</Text>
                          )}
                        </View>
                        <Text style={styles.slotMeta}>
                          {c.discipline} · {c.categorie}
                          {c.lieu ? ` · 📍 ${c.lieu}` : ''}
                        </Text>
                        {c.remarque ? (
                          <Text style={styles.slotRemarque}>💡 {c.remarque}</Text>
                        ) : null}

                        {/* Bouton signalement / annulation */}
                        {notifSent ? (
                          <TouchableOpacity
                            style={styles.cancelNotifBtn}
                            onPress={() => handleCancel(c, date)}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons name="bell-cancel-outline" size={13} color={COLORS.warning} />
                            <Text style={styles.cancelNotifText}>Absence signalée — Annuler</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={styles.signalBtn}
                            onPress={() => openModal(c)}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons name="bell-alert-outline" size={13} color={COLORS.danger} />
                            <Text style={styles.signalBtnText}>Signaler mon absence</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal de signalement d'absence */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Signaler mon absence</Text>
                {modalCreneau && (
                  <Text style={styles.modalSub}>
                    {modalCreneau.jour} · {modalCreneau.heureDebut}–{modalCreneau.heureFin} · {modalDate}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInputLabel}>Motif / message pour l'admin (optionnel)</Text>
            <TextInput
              style={styles.modalInput}
              value={modalMessage}
              onChangeText={setModalMessage}
              placeholder="Ex : rendez-vous médical, déplacement..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={300}
              numberOfLines={4}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, sending && { opacity: 0.6 }]}
                onPress={handleSend}
                disabled={sending}
              >
                <MaterialCommunityIcons name="send" size={16} color="#fff" />
                <Text style={styles.sendBtnText}>{sending ? 'Envoi...' : 'Envoyer'}</Text>
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
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '800' },
  headerSub:   { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.primary + '40',
  },
  toggleBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  dayCard: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, gap: 10, ...SHADOWS.card,
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border + '60', paddingBottom: 8,
  },
  dayTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' },
  dayCountBadge: {
    marginLeft: 'auto', backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full,
  },
  dayCountText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  slotList: { gap: 10 },
  slotItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.bgInput, borderRadius: RADIUS.md, padding: 12, gap: 10,
  },
  slotIconBox: {
    width: 36, height: 36, borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondary + '20',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  slotInfo: { flex: 1, gap: 4 },
  slotTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotTime: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  seanceTag: {
    color: COLORS.primary, fontSize: 11, fontWeight: '700',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.sm,
  },
  slotMeta: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  slotRemarque: { color: COLORS.textMuted, fontSize: 12, fontStyle: 'italic' },

  // Bouton signaler
  signalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: COLORS.danger + '15',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.danger + '40',
  },
  signalBtnText: { color: COLORS.danger, fontSize: 11, fontWeight: '700' },

  // Bouton annuler signalement
  cancelNotifBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: COLORS.warning + '15',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: COLORS.warning + '40',
  },
  cancelNotifText: { color: COLORS.warning, fontSize: 11, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  modalSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 3 },
  modalCloseBtn: {
    backgroundColor: COLORS.bgInput, borderRadius: RADIUS.full,
    padding: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  modalInputLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  modalInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.textPrimary, fontSize: 14,
    padding: 12, minHeight: 90, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  sendBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: RADIUS.md,
    backgroundColor: COLORS.danger,
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
