// src/screens/admin/ConfigScreen.js
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import useStore from '../../store/useStore';
import useTheme from '../../theme/useTheme';
import { THEME_OPTIONS } from '../../theme/themes';
import { CloudflareAPI } from '../../services/api';
import {
  getPaliersReduction,
  createPalierReduction,
  updatePalierReduction,
  deletePalierReduction,
} from '../../database/portefeuilleDb';

export default function ConfigScreen() {
  const {
    config, updateConfig, setCloudflareUrl, isCloudflare,
    disciplines, loadDisciplines, createDiscipline, updateDiscipline, deleteDiscipline,
    loadAdminUser, updateAdminCredentials,
    logout,
  } = useStore();
  const { colors: COLORS, RADIUS, shadows: SHADOWS, themeId, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const [fraisInscription, setFraisInscription] = useState(String(config.fraisInscription || 2000));
  const [fraisMensuel, setFraisMensuel] = useState(String(config.fraisMensuel || 1500));
  const [fraisAssurance, setFraisAssurance] = useState(String(config.fraisAssurance || 500));
  const [cloudflareUrl, setCloudflareUrlInput] = useState(config.cloudflareApiUrl || '');
  const [cloudflareTesting, setCloudflareTesting] = useState(false);
  const [cloudflareStatus, setCloudflareStatus] = useState(null); // { success: boolean, msg: string }
  const [cloudflareSaved, setCloudflareSaved] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [paliers, setPaliers] = useState([]);
  const [showPalierModal, setShowPalierModal] = useState(false);
  const [editingPalier, setEditingPalier] = useState(null);
  const [palierLabel, setPalierLabel] = useState('');
  const [palierMois, setPalierMois] = useState('');
  const [palierPct, setPalierPct] = useState('');

  const [showDiscModal, setShowDiscModal] = useState(false);
  const [editingDisc, setEditingDisc] = useState(null);
  const [discNom, setDiscNom] = useState('');

  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminSaved, setAdminSaved] = useState(false);

  useFocusEffect(useCallback(() => {
    loadDisciplines();
    getPaliersReduction().then(setPaliers).catch(() => setPaliers([]));
    loadAdminUser().then(admin => {
      if (admin) {
        setAdminUsername(admin.username || '');
        setAdminPassword('');
      }
    });
  }, []));

  const handleSaveConfig = async () => {
    const fi = parseFloat(fraisInscription);
    const fm = parseFloat(fraisMensuel);
    const fa = parseFloat(fraisAssurance);
    if (isNaN(fi) || fi <= 0 || isNaN(fm) || fm <= 0 || isNaN(fa) || fa < 0) {
      Alert.alert('Erreur', 'Montants invalides');
      return;
    }
    await updateConfig('fraisInscription', fi);
    await updateConfig('fraisMensuel', fm);
    await updateConfig('fraisAssurance', fa);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
  };

  const openPalierModal = (palier = null) => {
    setEditingPalier(palier);
    setPalierLabel(palier?.label || '');
    setPalierMois(String(palier?.nbMoisMin || ''));
    setPalierPct(String(palier?.reductionPct || ''));
    setShowPalierModal(true);
  };

  const handleSavePalier = async () => {
    const mois = parseInt(palierMois, 10);
    const pct = parseFloat(palierPct);
    if (!mois || mois < 1 || isNaN(pct) || pct <= 0 || pct >= 100) {
      Alert.alert('Erreur', 'Mois ≥ 1 et réduction entre 1 et 99 %');
      return;
    }
    if (editingPalier) {
      await updatePalierReduction({
        ...editingPalier,
        label: palierLabel.trim() || `${mois}+ mois`,
        nbMoisMin: mois,
        reductionPct: pct,
      });
    } else {
      await createPalierReduction({
        id: uuidv4(),
        label: palierLabel.trim() || `${mois}+ mois`,
        nbMoisMin: mois,
        reductionPct: pct,
      });
    }
    setShowPalierModal(false);
    setPaliers(await getPaliersReduction());
  };

  const handleDeletePalier = (id) => {
    Alert.alert('Supprimer le palier', 'Confirmer la suppression ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deletePalierReduction(id);
          setPaliers(await getPaliersReduction());
        },
      },
    ]);
  };



  const handleThemeChange = async (id) => {
    if (id !== themeId) await setTheme(id);
  };

  const openDiscModal = (disc = null) => {
    setEditingDisc(disc);
    setDiscNom(disc?.nom || '');
    setShowDiscModal(true);
  };

  const handleSaveDisc = async () => {
    const nom = discNom.trim();
    if (!nom) {
      Alert.alert('Erreur', 'Nom de la discipline requis');
      return;
    }
    try {
      if (editingDisc) {
        await updateDiscipline({ ...editingDisc, nom }, editingDisc.nom);
      } else {
        const slug = nom.toLowerCase().replace(/[^a-z0-9]/g, '');
        await createDiscipline({ id: `disc-${Date.now()}-${slug}`, nom });
      }
      setShowDiscModal(false);
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d\'enregistrer la discipline');
    }
  };

  const handleDeleteDisc = (disc) => {
    Alert.alert('Supprimer la discipline', `Confirmer la suppression de "${disc.nom}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDiscipline(disc.id);
          } catch (e) {
            Alert.alert('Suppression impossible', e.message);
          }
        },
      },
    ]);
  };

  const handleTestCloudflare = async () => {
    if (!cloudflareUrl.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir l\'URL de votre API Cloudflare Worker');
      return;
    }
    setCloudflareTesting(true);
    setCloudflareStatus(null);
    try {
      const data = await CloudflareAPI.checkHealth(cloudflareUrl.trim());
      if (data?.status === 'healthy') {
        setCloudflareStatus({ success: true, msg: 'Connexion à Cloudflare D1 réussie !' });
      } else {
        setCloudflareStatus({ success: false, msg: 'Réponse reçue mais statut anormal.' });
      }
    } catch (e) {
      setCloudflareStatus({ success: false, msg: 'Échec de connexion : ' + e.message });
    } finally {
      setCloudflareTesting(false);
    }
  };

  const handleSaveCloudflare = async () => {
    try {
      await setCloudflareUrl(cloudflareUrl.trim());
      setCloudflareSaved(true);
      setTimeout(() => setCloudflareSaved(false), 2500);
      Alert.alert(
        'Succès',
        cloudflareUrl.trim()
          ? 'URL Cloudflare enregistrée. L\'application synchronisera désormais les données avec Cloudflare D1.'
          : 'Mode Cloud désactivé (utilisation de la base locale SQLite).'
      );
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible d\'enregistrer la configuration');
    }
  };

  const handleSaveAdmin = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir un nom d\'utilisateur et un nouveau mot de passe');
      return;
    }
    try {
      await updateAdminCredentials(adminUsername, adminPassword);
      setAdminSaved(true);
      setAdminPassword('');
      setTimeout(() => setAdminSaved(false), 2000);
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de mettre à jour le compte admin');
    }
  };

  const getDisciplineIcon = (nom) => {
    const key = nom.toLowerCase();
    if (key.includes('natation') || key.includes('swim')) return 'swim';
    if (key.includes('kick') || key.includes('box')) return 'boxing-glove';
    return 'run';
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Thème */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="palette" size={20} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Thème de l'application</Text>
        </View>
        <Text style={styles.sectionHint}>Choisissez l'apparence de l'interface</Text>
        <View style={styles.themeGrid}>
          {THEME_OPTIONS.map(option => {
            const active = themeId === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.themeCard, active && styles.themeCardActive]}
                onPress={() => handleThemeChange(option.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.themePreview, { backgroundColor: option.preview }]}>
                  <MaterialCommunityIcons name={option.icon} size={22} color="#fff" />
                </View>
                <Text style={[styles.themeLabel, active && styles.themeLabelActive]}>{option.label}</Text>
                {active ? (
                  <MaterialCommunityIcons name="check-circle" size={18} color={COLORS.primary} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Assurance annuelle (DA)</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={fraisAssurance}
              onChangeText={setFraisAssurance}
              keyboardType="numeric"
              placeholder="500"
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

      {/* Paliers multi-mois */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="layers" size={20} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Paliers multi-mois</Text>
          <TouchableOpacity style={styles.addRemiseBtn} onPress={() => openPalierModal()}>
            <MaterialCommunityIcons name="plus" size={18} color={COLORS.primary} />
            <Text style={styles.addRemiseText}>Ajouter</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 10 }}>
          Réductions générales pour un paiement groupé (retard ou avance). Le calcul croise aussi
          l&apos;éventuelle dérogation adhérent et retient le montant le plus favorable.
        </Text>
        {paliers.length === 0 ? (
          <Text style={styles.emptyText}>Aucun palier défini</Text>
        ) : (
          paliers.map((p) => (
            <View key={p.id} style={styles.remiseCard}>
              <View style={styles.remiseInfo}>
                <Text style={styles.remiseLabel}>{p.label || `${p.nbMoisMin}+ mois`}</Text>
                <Text style={styles.remisePct}>
                  ≥ {p.nbMoisMin} mois · -{p.reductionPct}%
                </Text>
              </View>
              <View style={styles.remiseActions}>
                <TouchableOpacity onPress={() => openPalierModal(p)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="pencil" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeletePalier(p.id)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="trash-can" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Disciplines */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="run" size={20} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Disciplines sportives</Text>
          <TouchableOpacity style={styles.addRemiseBtn} onPress={() => openDiscModal()}>
            <MaterialCommunityIcons name="plus" size={18} color={COLORS.primary} />
            <Text style={styles.addRemiseText}>Ajouter</Text>
          </TouchableOpacity>
        </View>

        {disciplines.length === 0 ? (
          <Text style={styles.emptyText}>Aucune discipline configurée</Text>
        ) : (
          disciplines.map(d => (
            <View key={d.id} style={styles.remiseCard}>
              <View style={styles.discIconBox}>
                <MaterialCommunityIcons name={getDisciplineIcon(d.nom)} size={22} color={COLORS.primary} />
              </View>
              <View style={styles.remiseInfo}>
                <Text style={styles.remiseLabel}>{d.nom}</Text>
              </View>
              <View style={styles.remiseActions}>
                <TouchableOpacity onPress={() => openDiscModal(d)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="pencil" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteDisc(d)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="trash-can" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>



      {/* Base de données Cloudflare D1 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="cloud-sync" size={20} color="#F38020" />
          <Text style={styles.sectionTitle}>Base de données Cloudflare (D1)</Text>
        </View>
        <Text style={styles.sectionHint}>
          Synchronisez les données en direct entre administrateurs et adhérents via Cloudflare D1.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>URL de l'API Cloudflare Worker</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { fontSize: 14, fontWeight: '500' }]}
              value={cloudflareUrl}
              onChangeText={setCloudflareUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://cmbclub-api.votre-compte.workers.dev"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        </View>

        {cloudflareStatus ? (
          <View style={[styles.statusBox, { backgroundColor: cloudflareStatus.success ? COLORS.success + '15' : COLORS.danger + '15', borderColor: cloudflareStatus.success ? COLORS.success + '30' : COLORS.danger + '30' }]}>
            <MaterialCommunityIcons
              name={cloudflareStatus.success ? 'check-circle' : 'alert-circle'}
              size={18}
              color={cloudflareStatus.success ? COLORS.success : COLORS.danger}
            />
            <Text style={[styles.statusText, { color: cloudflareStatus.success ? COLORS.success : COLORS.danger }]}>
              {cloudflareStatus.msg}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={styles.testBtn}
            onPress={handleTestCloudflare}
            disabled={cloudflareTesting}
          >
            <MaterialCommunityIcons name="wifi-check" size={18} color={COLORS.primary} />
            <Text style={styles.testBtnText}>{cloudflareTesting ? 'Test en cours...' : 'Tester connexion'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, { flex: 1 }, cloudflareSaved && { backgroundColor: COLORS.success }]}
            onPress={handleSaveCloudflare}
          >
            <MaterialCommunityIcons name={cloudflareSaved ? 'check' : 'content-save'} size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{cloudflareSaved ? 'Enregistré !' : 'Enregistrer'}</Text>
          </TouchableOpacity>
        </View>
      </View>



      {/* Compte Administrateur Unique */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="shield-account" size={20} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Compte Administrateur Unique</Text>
        </View>
        <Text style={styles.sectionHint}>L'application autorise strictement UN SEUL compte administrateur.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Identifiant Admin</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={adminUsername}
              onChangeText={setAdminUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="admin"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Mot de passe Admin</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry={!showAdminPass}
              placeholder="Mot de passe"
              placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity onPress={() => setShowAdminPass(v => !v)} style={styles.unitBadge}>
              <MaterialCommunityIcons name={showAdminPass ? 'eye-off' : 'eye'} size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, adminSaved && { backgroundColor: COLORS.success }]}
          onPress={handleSaveAdmin}
        >
          <MaterialCommunityIcons name={adminSaved ? 'check' : 'shield-check'} size={18} color="#fff" />
          <Text style={styles.saveBtnText}>{adminSaved ? 'Administrateur mis à jour !' : 'Enregistrer les identifiants'}</Text>
        </TouchableOpacity>
      </View>

      {/* App info */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="information" size={20} color={COLORS.textMuted} />
          <Text style={styles.sectionTitle}>À propos</Text>
        </View>
        <Text style={styles.aboutText}>
          CMBClub v1.0.0{'\n'}
          Gestion des adhésions sportives{'\n'}
          Mode : {isCloudflare ? '☁️ Cloudflare D1 Distribué' : '📱 SQLite Local'}
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <MaterialCommunityIcons name="logout" size={18} color={COLORS.danger} />
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      {/* Discipline Modal */}
      <Modal visible={showDiscModal} transparent animationType="slide" onRequestClose={() => setShowDiscModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingDisc ? 'Modifier la discipline' : 'Nouvelle discipline'}</Text>

            <Text style={styles.fieldLabel}>Nom de la discipline</Text>
            <TextInput
              style={styles.modalInput}
              value={discNom}
              onChangeText={setDiscNom}
              placeholder="Ex: Judo, Football..."
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDiscModal(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveDisc}>
                <MaterialCommunityIcons name="content-save" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>



      {/* Palier multi-mois Modal */}
      <Modal visible={showPalierModal} transparent animationType="slide" onRequestClose={() => setShowPalierModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingPalier ? 'Modifier le palier' : 'Nouveau palier'}</Text>

            <Text style={styles.fieldLabel}>Libellé (optionnel)</Text>
            <TextInput
              style={styles.modalInput}
              value={palierLabel}
              onChangeText={setPalierLabel}
              placeholder="Ex: Pack 3 mois"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.fieldLabel}>À partir de (nombre de mois)</Text>
            <TextInput
              style={styles.modalInput}
              value={palierMois}
              onChangeText={setPalierMois}
              keyboardType="numeric"
              placeholder="Ex: 3"
              placeholderTextColor={COLORS.textMuted}
            />

            <Text style={styles.fieldLabel}>Réduction (%)</Text>
            <TextInput
              style={styles.modalInput}
              value={palierPct}
              onChangeText={setPalierPct}
              keyboardType="numeric"
              placeholder="Ex: 10"
              placeholderTextColor={COLORS.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPalierModal(false)}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSavePalier}>
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

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
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
  sectionHint: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: -6,
  },
  themeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  themeCard: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  themeCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  themePreview: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  themeLabelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  discIconBox: {
    width: 44,
    height: 44,
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
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
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.primary + '35',
  },
  testBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});

