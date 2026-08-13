// src/components/ValidationAssuranceModal.js
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  TextInput, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import useStore from '../store/useStore';
import useTheme from '../theme/useTheme';
import { getCategoryByAge, getEffectiveCategory } from '../utils/categories';
import { formatDate } from '../utils/seasons';

export default function ValidationAssuranceModal({ visible, onClose }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const { adherents, toggleAdherentAssure, saisonActive } = useStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'assure' | 'non_assure'
  const [togglingId, setTogglingId] = useState(null);
  const [printing, setPrinting] = useState(false);

  const stats = useMemo(() => {
    let nbAssures = 0;
    let nbNonAssures = 0;
    adherents.forEach(a => {
      if (a.assure) nbAssures++;
      else nbNonAssures++;
    });
    return { total: adherents.length, nbAssures, nbNonAssures };
  }, [adherents]);

  const filteredAdherents = useMemo(() => {
    return adherents.filter(a => {
      const q = search.toLowerCase().trim();
      const matchSearch = !q ||
        a.nom.toLowerCase().includes(q) ||
        a.prenom.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (a.discipline || '').toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (filter === 'assure' && !a.assure) return false;
      if (filter === 'non_assure' && a.assure) return false;

      return true;
    });
  }, [adherents, search, filter]);

  const handleToggle = async (adherent) => {
    const isCurrentlyAssure = Boolean(adherent.assure);
    const saisonLabel = saisonActive ? saisonActive.label : 'courante';

    if (!isCurrentlyAssure) {
      Alert.alert(
        'Valider l\'assurance 🛡️',
        `Valider l'assurance de ${adherent.prenom} ${adherent.nom} pour la saison ${saisonLabel} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Valider 🛡️',
            onPress: async () => {
              setTogglingId(adherent.id);
              try {
                await toggleAdherentAssure(adherent.id, false, saisonActive?.id);
                Alert.alert('✅ Assurance Validée', `L'assurance de ${adherent.prenom} ${adherent.nom} a été validée pour la saison ${saisonLabel}.`);
              } catch (e) {
                Alert.alert('Erreur', e.message || 'Impossible de valider l\'assurance.');
              } finally {
                setTogglingId(null);
              }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        'Assurance déjà validée 🛡️',
        `L'assurance de ${adherent.prenom} ${adherent.nom} est déjà validée pour la saison ${saisonLabel}.\n\nSouhaitez-vous annuler cette validation ?`,
        [
          { text: 'Conserver validée', style: 'cancel' },
          {
            text: 'Annuler la validation',
            style: 'destructive',
            onPress: async () => {
              setTogglingId(adherent.id);
              try {
                await toggleAdherentAssure(adherent.id, true, saisonActive?.id);
              } catch (e) {
                Alert.alert('Erreur', e.message || 'Impossible de modifier le statut d\'assurance.');
              } finally {
                setTogglingId(null);
              }
            },
          },
        ],
      );
    }
  };

  const handlePrint = async () => {
    if (filteredAdherents.length === 0) {
      Alert.alert('Information', 'Aucun adhérent dans la liste à imprimer.');
      return;
    }
    setPrinting(true);
    try {
      const now = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const saisonText = saisonActive ? saisonActive.label : 'N/A';

      let filterLabel = 'Tous les adhérents';
      if (filter === 'assure') filterLabel = 'Adhérents Assurés 🛡️';
      if (filter === 'non_assure') filterLabel = 'Adhérents Non Assurés ❌';

      const rowsHtml = filteredAdherents.map((item, index) => {
        const isAssure = Boolean(item.assure);
        const stColor = isAssure ? '#16A34A' : '#DC2626';
        const stLabel = isAssure ? 'Assuré 🛡️' : 'Non assuré ❌';

        return `
          <tr style="border-bottom:1px solid #E2E8F0">
            <td style="padding:8px 10px;text-align:center;color:#64748B;font-weight:600">${index + 1}</td>
            <td style="padding:8px 10px;font-family:monospace;font-weight:700">${item.code}</td>
            <td style="padding:8px 10px;font-weight:700">${item.nom.toUpperCase()} ${item.prenom}</td>
            <td style="padding:8px 10px">${formatDate(item.dateNaissance)}</td>
            <td style="padding:8px 10px">${item.lieuNaissance || '—'}</td>
            <td style="padding:8px 10px;color:#0284C7;font-weight:600">${item.discipline || '—'}</td>
            <td style="padding:8px 10px">${item.telephone || '—'}</td>
            <td style="padding:8px 10px">
              <span style="padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;color:${stColor};background:${stColor}18;border:1px solid ${stColor}40">${stLabel}</span>
            </td>
          </tr>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
          @page{size:A4 landscape;margin:10mm}
          body{font-family:Arial,sans-serif;font-size:11.5px;margin:0;padding:10px;color:#0F172A}
          .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #16A34A;padding-bottom:12px;margin-bottom:15px}
          h1{margin:0;font-size:20px;font-weight:900;color:#0F172A}
          .subtitle{margin:3px 0 0 0;font-size:12px;color:#64748B}
          .badge{display:inline-block;background:#0F172A;color:#16A34A;font-weight:700;padding:4px 12px;border-radius:12px;font-size:12px}
          .info-bar{display:flex;gap:15px;background:#F8FAFC;border:1px solid #E2E8F0;padding:8px 14px;border-radius:8px;margin-bottom:15px;font-size:11px}
          table{width:100%;border-collapse:collapse;margin-top:5px}
          th{background:#0F172A;color:#fff;text-align:left;padding:9px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
          .footer{margin-top:20px;display:flex;justify-content:space-between;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px}
        </style></head><body>
        <div class="header">
          <div>
            <h1>🛡️ CMB CLUB — VALIDATION DES ASSURANCES</h1>
            <p class="subtitle">Liste officielle des assurances · Saison ${saisonText}</p>
          </div>
          <div style="text-align:right">
            <div class="badge">Saison ${saisonText}</div>
            <div style="margin-top:4px;font-size:11px;color:#64748B">Imprimé le : ${now}</div>
            <div style="font-size:11px;color:#64748B">Total : <strong>${filteredAdherents.length} adhérent(s)</strong></div>
          </div>
        </div>
        <div class="info-bar">
          <span><b>Filtre appliqué :</b> ${filterLabel}</span>
          ${search ? `<span><b>Recherche :</b> "${search}"</span>` : ''}
        </div>
        <table>
          <thead><tr>
            <th style="width:30px;text-align:center">#</th>
            <th style="width:100px">ID Adhérent</th>
            <th>Nom & Prénom</th>
            <th>Date Naissance</th>
            <th>Lieu Naissance</th>
            <th>Discipline</th>
            <th>Téléphone</th>
            <th style="width:100px">Statut Assurance</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer"><div>CMBClub — Gestion des Assurances</div><div>Page 1 / 1</div></div>
      </body></html>`;

      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert("Erreur d'impression", e.message || 'Impossible d\'imprimer la liste.');
    } finally {
      setPrinting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="shield-check" size={24} color={COLORS.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Validation des Assurances</Text>
                <Text style={styles.subtitle}>
                  {saisonActive ? `Saison ${saisonActive.label} · ` : ''}Validation unique par saison
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Stats bar & Print Button */}
            <View style={styles.statsBar}>
              <TouchableOpacity
                style={[styles.statPill, filter === 'all' && styles.statPillActive]}
                onPress={() => setFilter('all')}
              >
                <Text style={[styles.statVal, filter === 'all' && { color: '#FFF' }]}>{stats.total}</Text>
                <Text style={[styles.statLbl, filter === 'all' && { color: '#FFF' }]}>Tous</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statPill, { backgroundColor: COLORS.success + '15' }, filter === 'assure' && styles.statPillActiveSuccess]}
                onPress={() => setFilter('assure')}
              >
                <Text style={[styles.statVal, { color: COLORS.success }, filter === 'assure' && { color: '#FFF' }]}>{stats.nbAssures}</Text>
                <Text style={[styles.statLbl, filter === 'assure' && { color: '#FFF' }]}>Assurés 🛡️</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statPill, { backgroundColor: COLORS.danger + '15' }, filter === 'non_assure' && styles.statPillActiveDanger]}
                onPress={() => setFilter('non_assure')}
              >
                <Text style={[styles.statVal, { color: COLORS.danger }, filter === 'non_assure' && { color: '#FFF' }]}>{stats.nbNonAssures}</Text>
                <Text style={[styles.statLbl, filter === 'non_assure' && { color: '#FFF' }]}>Non assurés ❌</Text>
              </TouchableOpacity>
            </View>

            {/* Print and Search bar */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={[styles.searchBox, { flex: 1 }]}>
                <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Rechercher par nom, code, discipline..."
                  placeholderTextColor={COLORS.textMuted}
                  value={search}
                  onChangeText={setSearch}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.printBtn, { backgroundColor: COLORS.primary }]}
                onPress={handlePrint}
                disabled={printing}
              >
                {printing ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="printer" size={18} color="#FFF" />
                    <Text style={styles.printBtnText}>Imprimer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* List */}
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {filteredAdherents.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="shield-search" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>Aucun adhérent dans cette liste</Text>
                <Text style={styles.emptySub}>Aucun résultat ne correspond aux filtres actuels.</Text>
              </View>
            ) : (
              filteredAdherents.map(item => {
                const isAssure = Boolean(item.assure);
                const cat = getEffectiveCategory(item);
                const isToggling = togglingId === item.id;

                return (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardInfoRow}>
                      <View style={styles.avatar}>
                        {item.photo ? (
                          <Image source={{ uri: item.photo }} style={styles.photo} />
                        ) : (
                          <View style={[styles.photoPlaceholder, { backgroundColor: cat.color + '20' }]}>
                            <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.name}>{item.prenom} {item.nom}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.code}>{item.code}</Text>
                          <Text style={styles.discText}>· {item.discipline || 'Sans disc.'}</Text>
                          {item.telephone ? <Text style={styles.telText}>· 📞 {item.telephone}</Text> : null}
                        </View>
                      </View>

                      {/* Status Tag */}
                      <View style={[styles.statusTag, isAssure ? styles.tagAssure : styles.tagNonAssure]}>
                        <MaterialCommunityIcons
                          name={isAssure ? "shield-check" : "shield-alert"}
                          size={13}
                          color={isAssure ? COLORS.success : COLORS.danger}
                        />
                        <Text style={[styles.statusTagText, { color: isAssure ? COLORS.success : COLORS.danger }]}>
                          {isAssure ? 'Validé' : 'Non assuré'}
                        </Text>
                      </View>
                    </View>

                    {/* Validation Button */}
                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        isAssure ? styles.toggleBtnSuccess : styles.toggleBtnPrimary,
                      ]}
                      onPress={() => handleToggle(item)}
                      disabled={isToggling}
                      activeOpacity={0.8}
                    >
                      {isToggling ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons
                            name={isAssure ? "shield-check" : "shield-plus-outline"}
                            size={16}
                            color="#FFF"
                          />
                          <Text style={styles.toggleBtnText}>
                            {isAssure
                              ? `Assurance Validée pour ${saisonActive?.label || 'la saison'} 🛡️`
                              : `Valider l'assurance pour ${saisonActive?.label || 'la saison'} 🛡️`}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose}>
              <Text style={styles.closeFooterText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '90%',
    minHeight: '60%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  closeBtn: {
    padding: 6,
  },
  statsBar: {
    flexDirection: 'row',
    gap: 8,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statPillActiveSuccess: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  statPillActiveDanger: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  statVal: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statLbl: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 13,
    padding: 0,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
  },
  printBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  card: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
  },
  photo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  photoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  code: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  discText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  telText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  tagAssure: {
    backgroundColor: COLORS.success + '15',
    borderColor: COLORS.success + '40',
  },
  tagNonAssure: {
    backgroundColor: COLORS.danger + '15',
    borderColor: COLORS.danger + '40',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
  },
  toggleBtnPrimary: {
    backgroundColor: COLORS.primary,
  },
  toggleBtnSuccess: {
    backgroundColor: COLORS.success + 'E5',
  },
  toggleBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  closeFooterBtn: {
    backgroundColor: COLORS.bgInput,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeFooterText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
