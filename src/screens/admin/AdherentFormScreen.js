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
import { COLORS, RADIUS, SHADOWS } from '../../theme/colors';
import { DISCIPLINES, BLOOD_GROUPS, getCategoryByAge } from '../../utils/categories';
import { generatePaymentSchedule, PAYMENT_STATUS } from '../../utils/payments';
import { buildAdherentCodeBase, canGenerateAdherentCode } from '../../utils/adherentCode';
import { generateUniqueAdherentCode } from '../../database/database';

const GENRES = [{ label: 'Masculin', value: 'M' }, { label: 'Féminin', value: 'F' }];

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  required = false,
  error,
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
        autoCorrect={false}
      />
      {error ? <Text style={styles.errorMsg}>{error}</Text> : null}
    </View>
  );
}

export default function AdherentFormScreen({ navigation, route }) {
  const { adherentId } = route.params || {};
  const isEdit = !!adherentId;
  const { adherents, createAdherent, updateAdherent, saisonActive, config, createPaiement, enrollAdherent } = useStore();

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
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showDiscPicker, setShowDiscPicker] = useState(false);
  const [showBloodPicker, setShowBloodPicker] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);

  useEffect(() => {
    if (!isEdit || editLoaded) return;
    const existing = adherents.find(a => a.id === adherentId);
    if (existing) {
      setForm({ ...existing });
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
  }, [isEdit, existingCode, form.nom, form.prenom, form.dateNaissance, form.lieuNaissance, form.discipline]);

  const category = form.dateNaissance ? getCategoryByAge(form.dateNaissance) : null;

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => (e[key] ? { ...e, [key]: undefined } : e));
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
        const adherent = { ...form, id: uuidv4(), code };
        await createAdherent(adherent);
        const password = (form.dateNaissance || '').replace(/-/g, '').slice(2);

        if (saisonActive) {
          const today = new Date().toISOString();
          await enrollAdherent(adherent.id, saisonActive.id, today);

          const schedule = generatePaymentSchedule(saisonActive.annee, config, today);
          for (const s of schedule) {
            await createPaiement({
              id: uuidv4(),
              adherentId: adherent.id,
              saisonId: saisonActive.id,
              type: s.type,
              label: s.label,
              mois: s.month,
              annee: s.year,
              montantDu: s.montantDu,
              statut: PAYMENT_STATUS.A_PAYER,
            });
          }
        }

        Alert.alert(
          'Adhérent inscrit',
          `${form.prenom} ${form.nom}\nCode : ${code}\nMot de passe (espace adhérent) : ${password}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
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
        keyboardDismissMode="on-drag"
      >

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photo de l'adhérent</Text>
          <PhotoPicker value={form.photo} onChange={v => set('photo', v)} />
          {category ? (
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <CategoryBadge category={category.label} />
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
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Prénom"
                value={form.prenom}
                onChangeText={v => set('prenom', v)}
                required
                error={errors.prenom}
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
          />

          <FormField
            label="Téléphone"
            value={form.telephone}
            onChangeText={v => set('telephone', v)}
            keyboardType="phone-pad"
          />

          <View style={[styles.codeBadge, !previewCode && styles.codeBadgeHidden]}>
            <MaterialCommunityIcons name="barcode" size={16} color={COLORS.primary} />
            <Text style={styles.codeBadgeLabel}>Code</Text>
            <Text style={styles.codeBadgeValue} selectable>
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
            <MaterialCommunityIcons name={showDiscPicker ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          {errors.discipline ? <Text style={styles.errorMsg}>{errors.discipline}</Text> : null}
          {showDiscPicker ? (
            <View style={styles.pickerDropdown}>
              {DISCIPLINES.map(d => (
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
});
