// src/screens/admin/AdherentFormScreen.js
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { v4 as uuidv4 } from 'uuid';
import useStore from '../../store/useStore';
import PhotoPicker from '../../components/PhotoPicker';
import CategoryBadge from '../../components/CategoryBadge';
import DateField from '../../components/DateField';
import useTheme from '../../theme/useTheme';
import { DISCIPLINES, BLOOD_GROUPS, CATEGORIES, getCategoryByAge, getEffectiveCategory } from '../../utils/categories';
import { generatePaymentSchedule, PAYMENT_STATUS, PAYMENT_TYPES } from '../../utils/payments';
import { buildAdherentCodeBase, canGenerateAdherentCode } from '../../utils/adherentCode';
import { generateUniqueAdherentCode } from '../../database/database';

import AdherentCardModal from '../../components/AdherentCardModal';

const GENRES = [{ label: 'Masculin', value: 'M' }, { label: 'Féminin', value: 'F' }];

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'words',
  required = false,
  error,
  COLORS,
  styles,
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>
        {label}{required ? <Text style={{ color: COLORS.danger }}> *</Text> : null}
      </Text>
      <TextInput
        style={[styles.textInput, error ? styles.inputError : null]}
        placeholder={placeholder || label}
        placeholderTextColor={COLORS.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
      {error ? <Text style={styles.errorMsg}>{error}</Text> : null}
    </View>
  );
}

export default function AdherentFormScreen({ navigation, route }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);
  const { adherentId } = route.params || {};
  const isEdit = !!adherentId;
  const {
    adherents, createAdherent, updateAdherent, saisonActive, config,
    createPaiement, enrollAdherent, disciplines, loadDisciplines,
  } = useStore();

  useEffect(() => {
    loadDisciplines();
  }, [loadDisciplines]);

  const activeDisciplines = useMemo(() => {
    if (disciplines && disciplines.length > 0) {
      return disciplines.map(d => d.nom);
    }
    return DISCIPLINES;
  }, [disciplines]);

  const [form, setForm] = useState({
    code: '',
    nom: '',
    prenom: '',
    dateNaissance: '',
    lieuNaissance: '',
    telephone: '',
    taille: '',
    groupeSanguin: '',
    observationsMedicales: '',
    photo: null,
    discipline: '',
    genre: 'M',
    assure: true,
    categorieOverride: null,
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showDiscPicker, setShowDiscPicker] = useState(false);
  const [showBloodPicker, setShowBloodPicker] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);

  // Paiement à l'inscription
  const [payAtRegistration, setPayAtRegistration] = useState(true);
  const [includeFraisInscription, setIncludeFraisInscription] = useState(true);
  const [nbMoisAvance, setNbMoisAvance] = useState(1);
  const [montantAvanceReg, setMontantAvanceReg] = useState('');
  const [isCustomRegAmount, setIsCustomRegAmount] = useState(false);
  const [paymentMode, setPaymentMode] = useState('Espèces');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Impression carte d'adhérent
  const [createdAdherent, setCreatedAdherent] = useState(null);
  const [showCardModal, setShowCardModal] = useState(false);

  useEffect(() => {
    if (!isEdit || editLoaded) return;
    const existing = adherents.find(a => a.id === adherentId);
    if (existing) {
      setForm({
        ...existing,
        assure: existing.assure === undefined ? true : Boolean(existing.assure),
      });
      setEditLoaded(true);
    }
  }, [isEdit, editLoaded, adherentId, adherents]);

  const existingCode = isEdit
    ? (form.code || adherents.find(a => a.id === adherentId)?.code)
    : null;

  const previewCode = useMemo(() => {
    if (isEdit && existingCode) return existingCode;
    if (!canGenerateAdherentCode(form)) return null;
    return buildAdherentCodeBase(form);
  }, [isEdit, existingCode, form.nom, form.prenom, form.dateNaissance]);

  const category = getEffectiveCategory(form);

  const fraisInscVal = includeFraisInscription ? (config?.fraisInscription || 2000) : 0;
  const fraisMensuelVal = config?.fraisMensuel || 1500;
  const totalExpectedReg = fraisInscVal + (nbMoisAvance * fraisMensuelVal);

  useEffect(() => {
    if (!isCustomRegAmount && payAtRegistration) {
      setMontantAvanceReg(String(totalExpectedReg));
    }
  }, [totalExpectedReg, isCustomRegAmount, payAtRegistration]);

  const handleNbMoisAvanceChange = (n) => {
    const validN = Math.max(0, Math.min(n, 12));
    setNbMoisAvance(validN);
    if (!isCustomRegAmount) {
      const total = (includeFraisInscription ? (config?.fraisInscription || 2000) : 0) + (validN * (config?.fraisMensuel || 1500));
      setMontantAvanceReg(String(total));
    }
  };

  const handleIncludeFraisInscChange = (val) => {
    setIncludeFraisInscription(val);
    if (!isCustomRegAmount) {
      const total = (val ? (config?.fraisInscription || 2000) : 0) + (nbMoisAvance * (config?.fraisMensuel || 1500));
      setMontantAvanceReg(String(total));
    }
  };

  const handleMontantRegTextChange = (text) => {
    setMontantAvanceReg(text);
    setIsCustomRegAmount(true);
  };

  const resetRegAmountToExact = () => {
    setMontantAvanceReg(String(totalExpectedReg));
    setIsCustomRegAmount(false);
  };

  const getInitialPaymentAmount = () => {
    if (!payAtRegistration) return 0;
    return parseFloat(montantAvanceReg) || 0;
  };

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => {
      if (!e[key]) return e;
      const copy = { ...e };
      delete copy[key];
      return copy;
    });
  };

  const validate = () => {
    const e = {};
    if (!form.nom.trim()) e.nom = 'Champ requis';
    if (!form.prenom.trim()) e.prenom = 'Champ requis';
    if (!form.dateNaissance) e.dateNaissance = 'Champ requis';
    if (!form.lieuNaissance.trim()) e.lieuNaissance = 'Champ requis';
    if (!form.discipline) e.discipline = 'Champ requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (isEdit) {
        await updateAdherent({ ...form, code: existingCode });
        Alert.alert('Succès', 'Adhérent modifié avec succès');
        navigation.goBack();
      } else {
        const code = await generateUniqueAdherentCode(form);
        const today = new Date();
        const dateInscription = today.toISOString().slice(0, 10);
        const adherent = { ...form, id: uuidv4(), code, dateInscription };
        await createAdherent(adherent);
        setCreatedAdherent(adherent);
        const password = (form.dateNaissance || '').replace(/-/g, '').slice(2);

        if (saisonActive) {
          const todayIso = today.toISOString();
          await enrollAdherent(adherent.id, saisonActive.id, todayIso);

          let initialPaymentRemaining = getInitialPaymentAmount();
          const schedule = generatePaymentSchedule(saisonActive.annee, config, todayIso);

          for (const s of schedule) {
            let montantPaye = 0;
            let statut = PAYMENT_STATUS.A_PAYER;
            let datePaiement = null;
            let notes = null;

            const isInscription = s.type === PAYMENT_TYPES.INSCRIPTION || s.type === 'inscription';
            const shouldAllocate = !isInscription || includeFraisInscription;

            if (initialPaymentRemaining > 0 && shouldAllocate) {
              const allocated = Math.min(initialPaymentRemaining, s.montantDu);
              montantPaye = allocated;
              initialPaymentRemaining -= allocated;
              if (montantPaye >= s.montantDu) {
                statut = PAYMENT_STATUS.PAYE;
              } else if (montantPaye > 0) {
                statut = PAYMENT_STATUS.AVANCE;
              }
              datePaiement = todayIso;
              notes = `Réglé à l'inscription (${paymentMode}${paymentNotes ? ' - ' + paymentNotes : ''})`;
            }

            await createPaiement({
              id: uuidv4(),
              adherentId: adherent.id,
              saisonId: saisonActive.id,
              type: s.type,
              label: s.label,
              mois: s.month,
              annee: s.year,
              montantDu: s.montantDu,
              montantPaye,
              datePaiement,
              statut,
              notes,
            });
          }
        }

        const verse = getInitialPaymentAmount();
        const fraisInsc = config?.fraisInscription || 2000;
        let paymentSummaryInfo = '';

        if (payAtRegistration && verse > 0) {
          if (verse < fraisInsc) {
            const resteInsc = fraisInsc - verse;
            paymentSummaryInfo = `\n\n💳 Paiement à l'inscription :\n• Montant versé : ${verse.toLocaleString()} DA (${paymentMode})\n• Reste à payer (Frais d'inscription) : ${resteInsc.toLocaleString()} DA`;
          } else {
            const surplus = verse - fraisInsc;
            paymentSummaryInfo = `\n\n💳 Paiement à l'inscription :\n• Montant versé : ${verse.toLocaleString()} DA (${paymentMode})\n• Frais d'inscription : Réglés à 100%`;
            if (surplus > 0) {
              paymentSummaryInfo += `\n• Avance mensualités : ${surplus.toLocaleString()} DA`;
            }
          }
        } else {
          paymentSummaryInfo = `\n\n💳 Paiement à l'inscription :\nAucun versement (0 DA)\n• Reste à payer (Frais d'inscription) : ${fraisInsc.toLocaleString()} DA`;
        }

        Alert.alert(
          'Adhérent inscrit avec succès',
          `Nom : ${form.prenom} ${form.nom}\nCode : ${code}\nMot de passe : ${password}${paymentSummaryInfo}`,
          [
            {
              text: 'Imprimer la carte 🖨️',
              onPress: () => setShowCardModal(true),
            },
            {
              text: 'Terminer',
              onPress: () => navigation.goBack(),
            },
          ],
        );
      }
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photo de l'adhérent</Text>
          <PhotoPicker value={form.photo} onChange={v => set('photo', v)} />
          {/* Catégorie : badge + sélecteur override */}
          {form.dateNaissance ? (
            <View style={{ alignItems: 'center', marginTop: 8, gap: 6 }}>
              <TouchableOpacity
                onPress={() => setShowCatPicker(v => !v)}
                style={[
                  styles.catPickerBtn,
                  form.categorieOverride && { borderColor: COLORS.warning },
                ]}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 18 }}>{category?.icon}</Text>
                <Text style={[styles.catPickerLabel, { color: category?.color }]}>
                  {category?.label}
                </Text>
                {form.categorieOverride ? (
                  <View style={[styles.overrideBadge, { backgroundColor: COLORS.warning + '25', borderColor: COLORS.warning }]}>
                    <MaterialCommunityIcons name="lock" size={11} color={COLORS.warning} />
                    <Text style={[styles.overrideBadgeText, { color: COLORS.warning }]}>Manuel</Text>
                  </View>
                ) : (
                  <View style={[styles.overrideBadge, { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary + '40' }]}>
                    <MaterialCommunityIcons name="auto-fix" size={11} color={COLORS.primary} />
                    <Text style={[styles.overrideBadgeText, { color: COLORS.primary }]}>Auto</Text>
                  </View>
                )}
                <MaterialCommunityIcons
                  name={showCatPicker ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
              {form.categorieOverride && (
                <Text style={styles.catAutoHint}>
                  Cat. calculée : {getCategoryByAge(form.dateNaissance)?.label}
                </Text>
              )}
              {showCatPicker && (
                <View style={styles.catDropdown}>
                  <Text style={styles.catDropdownTitle}>Choisir une catégorie</Text>
                  <View style={styles.catGrid}>
                    {CATEGORIES.map(c => (
                      <TouchableOpacity
                        key={c.label}
                        style={[
                          styles.catChip,
                          (form.categorieOverride === c.label) && { borderColor: c.color, backgroundColor: c.color + '20' },
                        ]}
                        onPress={() => {
                          set('categorieOverride', c.label);
                          setShowCatPicker(false);
                        }}
                      >
                        <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                        <Text style={[styles.catChipText, { color: c.color }]}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {form.categorieOverride && (
                    <TouchableOpacity
                      style={styles.catResetBtn}
                      onPress={() => { set('categorieOverride', null); setShowCatPicker(false); }}
                    >
                      <MaterialCommunityIcons name="refresh" size={14} color={COLORS.textSecondary} />
                      <Text style={[styles.catResetText, { color: COLORS.textSecondary }]}>Réinitialiser (auto)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations personnelles</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Genre</Text>
            <View style={styles.toggleRow}>
              {GENRES.map(g => (
                <TouchableOpacity
                  key={g.value}
                  style={[styles.toggleBtn, form.genre === g.value && styles.toggleActive]}
                  onPress={() => set('genre', g.value)}
                >
                  <Text style={[styles.toggleText, form.genre === g.value && { color: COLORS.primary }]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Nom"
                value={form.nom}
                onChangeText={v => set('nom', v)}
                required
                error={errors.nom}
                COLORS={COLORS}
                styles={styles}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Prénom"
                value={form.prenom}
                onChangeText={v => set('prenom', v)}
                required
                error={errors.prenom}
                COLORS={COLORS}
                styles={styles}
              />
            </View>
          </View>

          <DateField
            label="Date de naissance"
            value={form.dateNaissance}
            onChange={v => set('dateNaissance', v)}
            required
            error={errors.dateNaissance}
          />

          <FormField
            label="Lieu de naissance"
            value={form.lieuNaissance}
            onChangeText={v => set('lieuNaissance', v)}
            required
            error={errors.lieuNaissance}
            COLORS={COLORS}
            styles={styles}
          />

          <FormField
            label="Téléphone"
            value={form.telephone}
            onChangeText={v => set('telephone', v)}
            keyboardType="phone-pad"
            autoCapitalize="none"
            COLORS={COLORS}
            styles={styles}
          />

          <View style={[styles.codeBadge, !previewCode && styles.codeBadgeHidden]}>
            <MaterialCommunityIcons name="barcode" size={16} color={COLORS.primary} />
            <Text style={styles.codeBadgeLabel}>Code</Text>
            <Text style={styles.codeBadgeValue}>
              {previewCode || '—'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations médicales</Text>

          <FormField
            label="Taille (cm)"
            value={form.taille}
            onChangeText={v => set('taille', v)}
            keyboardType="numeric"
            COLORS={COLORS}
            styles={styles}
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Groupe sanguin</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowBloodPicker(v => !v)}
            >
              <Text style={[styles.pickerValue, !form.groupeSanguin && { color: COLORS.textMuted }]}>
                {form.groupeSanguin || 'Sélectionner...'}
              </Text>
              <MaterialCommunityIcons name={showBloodPicker ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
            {showBloodPicker ? (
              <View style={styles.pickerDropdown}>
                <View style={styles.pickerGrid}>
                  {BLOOD_GROUPS.map(bg => (
                    <TouchableOpacity
                      key={bg}
                      style={[styles.pickerChip, form.groupeSanguin === bg && { backgroundColor: COLORS.primary + '30', borderColor: COLORS.primary }]}
                      onPress={() => { set('groupeSanguin', bg); setShowBloodPicker(false); }}
                    >
                      <Text style={[styles.pickerChipText, form.groupeSanguin === bg && { color: COLORS.primary }]}>{bg}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Observations médicales</Text>
            <TextInput
              style={[styles.textInput, styles.textarea]}
              placeholder="Allergies, traitements, contre-indications..."
              placeholderTextColor={COLORS.textMuted}
              value={form.observationsMedicales}
              onChangeText={v => set('observationsMedicales', v)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Discipline sportive <Text style={{ color: COLORS.danger }}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.pickerBtn, errors.discipline && styles.inputError]}
            onPress={() => setShowDiscPicker(v => !v)}
          >
            <Text style={[styles.pickerValue, !form.discipline && { color: COLORS.textMuted }]}>
              {form.discipline || 'Choisir une discipline...'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          {errors.discipline ? <Text style={styles.errorMsg}>{errors.discipline}</Text> : null}
          {showDiscPicker ? (
            <View style={styles.pickerDropdown}>
              {activeDisciplines.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[styles.discItem, form.discipline === d && { backgroundColor: COLORS.primary + '20' }]}
                  onPress={() => { set('discipline', d); setShowDiscPicker(false); }}
                >
                  <Text style={[styles.discText, form.discipline === d && { color: COLORS.primary }]}>{d}</Text>
                  {form.discipline === d ? <MaterialCommunityIcons name="check" size={16} color={COLORS.primary} /> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        {/* Section Assurance */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.toggleRowBox}
            onPress={() => setForm(prev => ({ ...prev, assure: !prev.assure }))}
            activeOpacity={0.8}
          >
            <View style={styles.toggleTextGroup}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons
                  name={form.assure ? "shield-check" : "shield-outline"}
                  size={20}
                  color={form.assure ? COLORS.success : COLORS.textMuted}
                />
                <Text style={styles.toggleTitle}>Assurance de l'adhérent</Text>
              </View>
              <Text style={styles.toggleSub}>
                {form.assure ? 'Adhérent assuré pour la saison active' : 'Adhérent non assuré'}
              </Text>
            </View>
            <View style={[styles.switchTrack, form.assure && styles.switchTrackActive]}>
              <View style={[styles.switchThumb, form.assure && styles.switchThumbActive]} />
            </View>
          </TouchableOpacity>
        </View>

        {!isEdit ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="cash-register" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Paiement à l'inscription</Text>
            </View>

            <TouchableOpacity
              style={styles.toggleRowBox}
              onPress={() => setPayAtRegistration(v => !v)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={payAtRegistration ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={22}
                color={payAtRegistration ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={styles.toggleRowLabel}>
                Enregistrer un paiement immédiat
              </Text>
            </TouchableOpacity>

            {payAtRegistration ? (
              <View style={{ gap: 14, marginTop: 8 }}>
                {/* Checkbox Frais Inscription */}
                <TouchableOpacity
                  style={styles.toggleRowBox}
                  onPress={() => handleIncludeFraisInscChange(!includeFraisInscription)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={includeFraisInscription ? "checkbox-marked" : "checkbox-blank-outline"}
                    size={20}
                    color={includeFraisInscription ? COLORS.primary : COLORS.textMuted}
                  />
                  <Text style={styles.toggleRowLabel}>
                    Inclure les frais d'inscription ({config?.fraisInscription || 2000} DA)
                  </Text>
                </TouchableOpacity>

                {/* Counter for Months */}
                <Text style={styles.fieldLabel}>Nombre de mois de cotisations à avancer</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => handleNbMoisAvanceChange(nbMoisAvance - 1)}
                    disabled={nbMoisAvance <= 0}
                  >
                    <MaterialCommunityIcons name="minus" size={20} color={nbMoisAvance <= 0 ? COLORS.textMuted : COLORS.primary} />
                  </TouchableOpacity>

                  <View style={styles.counterDisplay}>
                    <Text style={styles.counterText}>{nbMoisAvance}</Text>
                    <Text style={styles.counterSubText}>mois ({nbMoisAvance * (config?.fraisMensuel || 1500)} DA)</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => handleNbMoisAvanceChange(nbMoisAvance + 1)}
                    disabled={nbMoisAvance >= 12}
                  >
                    <MaterialCommunityIcons name="plus" size={20} color={nbMoisAvance >= 12 ? COLORS.textMuted : COLORS.primary} />
                  </TouchableOpacity>
                </View>

                {/* Quick Chips */}
                <View style={styles.quickChipsRow}>
                  {[0, 1, 2, 3, 5, 10].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.quickChip, nbMoisAvance === n && styles.quickChipActive]}
                      onPress={() => handleNbMoisAvanceChange(n)}
                    >
                      <Text style={[styles.quickChipText, nbMoisAvance === n && { color: COLORS.primary }]}>
                        {n === 0 ? 'Aucun mois' : `${n} mois`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Input Montant Avancé */}
                <View style={styles.inputHeaderRow}>
                  <Text style={styles.fieldLabel}>Montant avancé / versé par l'adhérent (DA)</Text>
                  {isCustomRegAmount && (
                    <TouchableOpacity onPress={resetRegAmountToExact} style={styles.resetAmountBtn}>
                      <MaterialCommunityIcons name="refresh" size={14} color={COLORS.primary} />
                      <Text style={styles.resetAmountText}>Montant exact</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={[styles.textInput, { fontSize: 17, fontWeight: '700', color: COLORS.primary }]}
                  value={montantAvanceReg}
                  onChangeText={handleMontantRegTextChange}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />

                {/* Mode de paiement */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Mode de paiement</Text>
                  <View style={styles.modeRow}>
                    {['Espèces', 'Chèque', 'Virement'].map(mode => (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.modeBtn, paymentMode === mode && styles.modeBtnActive]}
                        onPress={() => setPaymentMode(mode)}
                      >
                        <Text style={[styles.modeText, paymentMode === mode && styles.modeTextActive]}>
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <FormField
                  label="Notes / Référence (optionnel)"
                  value={paymentNotes}
                  onChangeText={setPaymentNotes}
                  placeholder="ex: N° de chèque, reçu..."
                  autoCapitalize="sentences"
                  COLORS={COLORS}
                  styles={styles}
                />

                {/* Live Payment Summary Box */}
                <View style={styles.recapBox}>
                  <View style={styles.recapRow}>
                    <Text style={styles.recapLabel}>Frais d'inscription :</Text>
                    <Text style={styles.recapValue}>{fraisInscVal.toLocaleString()} DA</Text>
                  </View>

                  <View style={styles.recapRow}>
                    <Text style={styles.recapLabel}>Mensualités ({nbMoisAvance} mois) :</Text>
                    <Text style={styles.recapValue}>{(nbMoisAvance * (config?.fraisMensuel || 1500)).toLocaleString()} DA</Text>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.recapRow}>
                    <Text style={[styles.recapLabel, { color: COLORS.textPrimary, fontWeight: '700' }]}>Total attendu :</Text>
                    <Text style={[styles.recapValue, { color: COLORS.primary, fontWeight: '800' }]}>{totalExpectedReg.toLocaleString()} DA</Text>
                  </View>

                  <View style={styles.recapRow}>
                    <Text style={styles.recapLabel}>Montant versé par l'adhérent :</Text>
                    <Text style={styles.recapVerse}>{(parseFloat(montantAvanceReg) || 0).toLocaleString()} DA</Text>
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.recapRow}>
                    <Text style={[styles.recapLabel, { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 }]}>Reste à payer :</Text>
                    <Text style={[styles.recapReste, { color: Math.max(0, totalExpectedReg - (parseFloat(montantAvanceReg) || 0)) > 0 ? COLORS.warning : COLORS.success, fontSize: 17, fontWeight: '900' }]}>
                      {Math.max(0, totalExpectedReg - (parseFloat(montantAvanceReg) || 0)).toLocaleString()} DA
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name={isEdit ? 'content-save' : 'account-plus'} size={22} color="#fff" />
              <Text style={styles.saveBtnText}>
                {isEdit ? 'Enregistrer les modifications' : 'Inscrire l\'adhérent'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>

      {createdAdherent && (
        <AdherentCardModal
          visible={showCardModal}
          adherent={createdAdherent}
          onClose={() => {
            setShowCardModal(false);
            navigation.goBack();
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
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
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', gap: 10 },
  fieldGroup: { gap: 6 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  textInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary + '15',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    marginTop: 4,
  },
  codeBadgeLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  codeBadgeValue: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  codeBadgeHidden: {
    opacity: 0.35,
  },
  inputError: { borderColor: COLORS.danger },
  errorMsg: { color: COLORS.danger, fontSize: 12, marginTop: 2 },
  textarea: { height: 90 },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  toggleText: { color: COLORS.textSecondary, fontWeight: '600' },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  pickerValue: { color: COLORS.textPrimary, fontSize: 15 },
  pickerDropdown: {
    backgroundColor: COLORS.bgModal,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 8,
  },
  pickerChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerChipText: { color: COLORS.textPrimary, fontWeight: '600' },
  discItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  discText: { color: COLORS.textPrimary, fontSize: 14 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  toggleRowBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: COLORS.bgInput,
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleTextGroup: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleSub: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: COLORS.success + '30',
    borderColor: COLORS.success,
    borderWidth: 1,
  },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.textMuted,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.success,
  },
  toggleRowLabel: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  optionGrid: {
    gap: 8,
  },
  optionChip: {
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionChipActive: {
    backgroundColor: COLORS.primary + '15',
    borderColor: COLORS.primary,
  },
  optionChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  modeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modeTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  recapBox: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary + '35',
    marginTop: 4,
  },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recapLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  recapVerse: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  recapValue: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
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
    minWidth: 80,
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
  recapReste: {
    color: COLORS.warning,
    fontWeight: '700',
    fontSize: 15,
  },
  recapSuccess: {
    color: COLORS.success,
    fontWeight: '700',
    fontSize: 13,
  },
  saveBtn: {
    margin: 16,
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...SHADOWS.button,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // ── Catégorie override ──
  catPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignSelf: 'center',
  },
  catPickerLabel: {
    fontWeight: '700',
    fontSize: 14,
  },
  overrideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  overrideBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  catAutoHint: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  catDropdown: {
    width: '100%',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  catDropdownTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgInput,
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  catResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  catResetText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

