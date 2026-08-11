// src/components/ValidationAssuranceModal.js
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  TextInput, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import useStore from '../store/useStore';
import useTheme from '../theme/useTheme';
import { getCategoryByAge } from '../utils/categories';

export default function ValidationAssuranceModal({ visible, onClose }) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  const { adherents, toggleAdherentAssure } = useStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'assure' | 'non_assure'
  const [togglingId, setTogglingId] = useState(null);

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
    setTogglingId(adherent.id);
    try {
      await toggleAdherentAssure(adherent.id, Boolean(adherent.assure));
    } catch (e) {
      Alert.alert('Erreur', e.message || 'Impossible de modifier le statut d\'assurance.');
    } finally {
      setTogglingId(null);
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
                <Text style={styles.subtitle}>Gestion & validation du statut d'assurance des adhérents</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Stats bar */}
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

            {/* Search Input */}
            <View style={styles.searchBox}>
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
                const cat = getCategoryByAge(item.dateNaissance);
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.code}>{item.code}</Text>
                          <Text style={styles.discText}>· {item.discipline || 'Sans disc.'}</Text>
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
                          {isAssure ? 'Assuré' : 'Non assuré'}
                        </Text>
                      </View>
                    </View>

                    {/* Quick Toggle Action Button */}
                    <TouchableOpacity
                      style={[
                        styles.toggleBtn,
                        isAssure ? styles.toggleBtnDanger : styles.toggleBtnSuccess,
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
                            name={isAssure ? "close-circle-outline" : "shield-check-outline"}
                            size={16}
                            color="#FFF"
                          />
                          <Text style={styles.toggleBtnText}>
                            {isAssure ? 'Marquer comme non assuré' : 'Valider l\'assurance 🛡️'}
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
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  toggleBtnSuccess: {
    backgroundColor: COLORS.success,
  },
  toggleBtnDanger: {
    backgroundColor: COLORS.textMuted + '80',
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
