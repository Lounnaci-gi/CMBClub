// src/components/PhotoPicker.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, Modal, Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS } from '../theme/colors';

export default function PhotoPicker({ value, onChange }) {
  const [showModal, setShowModal] = useState(false);

  const requestAndLaunch = async (launcher) => {
    setShowModal(false);
    setTimeout(async () => {
      try {
        const result = await launcher();
        if (!result.canceled && result.assets?.length > 0) {
          onChange(result.assets[0].uri);
        }
      } catch (e) {
        Alert.alert('Erreur', e.message);
      }
    }, 300);
  };

  const takePhoto = () =>
    requestAndLaunch(async () => {
      await ImagePicker.requestCameraPermissionsAsync();
      return ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });
    });

  const pickFromGallery = () =>
    requestAndLaunch(async () => {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      return ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });
    });

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.picker, value && styles.pickerWithImage]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.85}
      >
        {value ? (
          <Image source={{ uri: value }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="camera-plus" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.placeholderText}>Ajouter une photo</Text>
            <Text style={styles.placeholderSub}>Caméra ou galerie</Text>
          </View>
        )}
        {value && (
          <View style={styles.editOverlay}>
            <MaterialCommunityIcons name="pencil" size={18} color="#fff" />
          </View>
        )}
      </TouchableOpacity>

      <Modal
        transparent
        visible={showModal}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable style={styles.modalBg} onPress={() => setShowModal(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choisir une photo</Text>

            <TouchableOpacity style={styles.optionBtn} onPress={takePhoto}>
              <View style={[styles.optionIcon, { backgroundColor: COLORS.primary + '20' }]}>
                <MaterialCommunityIcons name="camera" size={24} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.optionTitle}>Prendre une photo</Text>
                <Text style={styles.optionSub}>Utiliser la caméra</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionBtn} onPress={pickFromGallery}>
              <View style={[styles.optionIcon, { backgroundColor: COLORS.secondary + '20' }]}>
                <MaterialCommunityIcons name="image-multiple" size={24} color={COLORS.secondary} />
              </View>
              <View>
                <Text style={styles.optionTitle}>Depuis la galerie</Text>
                <Text style={styles.optionSub}>Choisir une image existante</Text>
              </View>
            </TouchableOpacity>

            {value && (
              <TouchableOpacity
                style={[styles.optionBtn, styles.deleteBtn]}
                onPress={() => { onChange(null); setShowModal(false); }}
              >
                <View style={[styles.optionIcon, { backgroundColor: COLORS.danger + '20' }]}>
                  <MaterialCommunityIcons name="trash-can" size={24} color={COLORS.danger} />
                </View>
                <View>
                  <Text style={[styles.optionTitle, { color: COLORS.danger }]}>Supprimer</Text>
                  <Text style={styles.optionSub}>Retirer la photo actuelle</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginBottom: 8 },
  picker: {
    width: 130,
    height: 170,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bgInput,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  pickerWithImage: {
    borderStyle: 'solid',
    borderColor: COLORS.primary,
  },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  placeholderSub: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  editOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 5,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    marginBottom: 8,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteBtn: { borderColor: COLORS.danger + '40' },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  optionSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
});
