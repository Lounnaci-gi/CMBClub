// src/components/QrAttendanceScannerModal.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Image, ActivityIndicator, Animated, Platform, StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import useTheme from '../theme/useTheme';
import { getEffectiveCategory } from '../utils/categories';

/**
 * Extrait le code adhérent ou l'identifiant depuis le texte d'un QR code scanné
 */
export function extractAdherentIdentifier(qrData) {
  if (!qrData) return null;
  const str = String(qrData).trim();

  // 1. Essai de parser en JSON si c'est un format JSON
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      if (parsed.code) return String(parsed.code).trim();
      if (parsed.id) return String(parsed.id).trim();
      if (parsed.adherentId) return String(parsed.adherentId).trim();
    }
  } catch (_e) {
    // Pas un JSON, continuer
  }

  // 2. Format CMBClub standard généré par qrGenerator.js: "ID Code : KICK-2026-001" ou "Code : ..."
  const idCodeMatch = str.match(/(?:ID\s*Code|Code)\s*:\s*([^\r\n]+)/i);
  if (idCodeMatch && idCodeMatch[1]) {
    return idCodeMatch[1].trim();
  }

  // 3. Essai d'extraire par "Nom & Prénom" ou regex directe de code
  const codeDirectMatch = str.match(/\b([A-Z0-9]{3,8}-\d{4}-\d{3,5})\b/i);
  if (codeDirectMatch && codeDirectMatch[1]) {
    return codeDirectMatch[1].trim();
  }

  // 4. Chaîne brute directe
  return str;
}

export default function QrAttendanceScannerModal({
  visible,
  onClose,
  allAdherents = [],
  onAdherentScanned,
  selectedCreneau = null,
}) {
  const { colors: COLORS, RADIUS, shadows: SHADOWS } = useTheme();
  const styles = createStyles(COLORS, RADIUS, SHADOWS);

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [facing, setFacing] = useState('back');
  const [scanPaused, setScanPaused] = useState(false);
  const [lastScannedResult, setLastScannedResult] = useState(null);
  const [scanCount, setScanCount] = useState(0);

  // Animation pour le laser de scan
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setScanCount(0);
      setLastScannedResult(null);
      setScanPaused(false);
      setTorch(false);

      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [visible, scanLineAnim]);

  const handleBarCodeScanned = ({ data }) => {
    if (scanPaused || !data) return;

    setScanPaused(true);
    const identifier = extractAdherentIdentifier(data);

    // Recherche de l'adhérent dans la liste
    let foundAdherent = null;
    if (identifier) {
      const idLower = identifier.toLowerCase();
      foundAdherent = allAdherents.find(a => {
        const codeMatch = (a.code || '').toLowerCase() === idLower;
        const idMatch = (a.id || '').toLowerCase() === idLower;
        return codeMatch || idMatch;
      });
    }

    // Fallback: recherche textuelle par nom complet si présent dans le QR
    if (!foundAdherent && data.length > 5) {
      const lines = data.split('\n').map(l => l.trim().toLowerCase());
      foundAdherent = allAdherents.find(a => {
        const fullName = `${(a.nom || '').toLowerCase()} ${(a.prenom || '').toLowerCase()}`.trim();
        const revFullName = `${(a.prenom || '').toLowerCase()} ${(a.nom || '').toLowerCase()}`.trim();
        return lines.some(l => l.includes(fullName) || l.includes(revFullName));
      });
    }

    if (foundAdherent) {
      // Vibration haptique succès
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      const effectiveCat = getEffectiveCategory(foundAdherent);
      const res = onAdherentScanned ? onAdherentScanned(foundAdherent) : null;

      setScanCount(prev => prev + 1);
      setLastScannedResult({
        success: true,
        adherent: foundAdherent,
        category: effectiveCat,
        statutInfo: res?.statutText || 'Présent ✅',
        timeStr: res?.timeStr || new Date().toLocaleTimeString().slice(0, 5),
      });

      // Auto-reprise après 2 secondes
      setTimeout(() => {
        setScanPaused(false);
        setLastScannedResult(null);
      }, 2200);
    } else {
      // Vibration haptique erreur
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

      setLastScannedResult({
        success: false,
        message: 'QR Code non reconnu ou adhérent introuvable.',
      });

      setTimeout(() => {
        setScanPaused(false);
        setLastScannedResult(null);
      }, 2000);
    }
  };

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Scan QR Code — Appel</Text>
            {selectedCreneau ? (
              <Text style={styles.headerSub} numberOfLines={1}>
                {selectedCreneau.discipline} · {selectedCreneau.heureDebut} ({selectedCreneau.categorie})
              </Text>
            ) : null}
          </View>

          <View style={styles.scanCountBadge}>
            <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.success} />
            <Text style={styles.scanCountText}>{scanCount}</Text>
          </View>
        </View>

        {/* Camera or Permission View */}
        {!permission ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.permissionText}>Chargement de la caméra...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerContainer}>
            <MaterialCommunityIcons name="camera-off" size={56} color={COLORS.warning} />
            <Text style={styles.permissionTitle}>Autorisation requise</Text>
            <Text style={styles.permissionText}>
              L'application a besoin d'accéder à votre caméra pour scanner les QR codes des cartes adhérents.
            </Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission} activeOpacity={0.8}>
              <MaterialCommunityIcons name="camera" size={20} color="#FFF" />
              <Text style={styles.permissionBtnText}>Autoriser la caméra</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing={facing}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanPaused ? undefined : handleBarCodeScanned}
            />

            {/* Viewfinder Target Mask */}
            <View style={styles.overlayMask}>
              {/* Target Square */}
              <View style={styles.targetFrame}>
                {/* Corner markers */}
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />

                {/* Animated Scan Laser */}
                {!scanPaused && (
                  <Animated.View
                    style={[
                      styles.scanLaser,
                      {
                        transform: [{ translateY }],
                      },
                    ]}
                  />
                )}

                {/* Scanned Adherent Floating Result Banner */}
                {lastScannedResult && (
                  <View
                    style={[
                      styles.resultCard,
                      lastScannedResult.success ? styles.resultSuccess : styles.resultError,
                    ]}
                  >
                    {lastScannedResult.success ? (
                      <>
                        <View style={styles.resultPhotoWrap}>
                          {lastScannedResult.adherent.photo ? (
                            <Image
                              source={{ uri: lastScannedResult.adherent.photo }}
                              style={styles.resultPhoto}
                            />
                          ) : (
                            <View style={styles.resultPhotoPlaceholder}>
                              <Text style={{ fontSize: 18 }}>{lastScannedResult.category.icon}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.resultDetails}>
                          <Text style={styles.resultName} numberOfLines={1}>
                            {lastScannedResult.adherent.prenom} {lastScannedResult.adherent.nom}
                          </Text>
                          <Text style={styles.resultMeta}>
                            {lastScannedResult.adherent.code} · {lastScannedResult.category.label}
                          </Text>
                          <View style={styles.resultStatusBadge}>
                            <MaterialCommunityIcons name="check-bold" size={14} color="#FFF" />
                            <Text style={styles.resultStatusText}>
                              {lastScannedResult.statutInfo}
                            </Text>
                          </View>
                        </View>
                      </>
                    ) : (
                      <View style={styles.errorWrap}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#FF6B6B" />
                        <Text style={styles.errorText}>{lastScannedResult.message}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              <Text style={styles.instructionText}>
                {scanPaused ? 'Validation en cours...' : 'Pointez le QR Code de la carte adhérent'}
              </Text>
            </View>

            {/* Bottom Actions Bar */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={[styles.toolBtn, torch && styles.toolBtnActive]}
                onPress={() => setTorch(prev => !prev)}
              >
                <MaterialCommunityIcons
                  name={torch ? 'flashlight' : 'flashlight-off'}
                  size={24}
                  color={torch ? COLORS.warning : '#FFF'}
                />
                <Text style={styles.toolBtnText}>Torche</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.finishBtn}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="clipboard-check" size={20} color="#FFF" />
                <Text style={styles.finishBtnText}>Terminer ({scanCount})</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolBtn}
                onPress={() => setFacing(prev => (prev === 'back' ? 'front' : 'back'))}
              >
                <MaterialCommunityIcons name="camera-flip-outline" size={24} color="#FFF" />
                <Text style={styles.toolBtnText}>Changer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10, 16, 26, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
  },
  headerBtn: {
    padding: 8,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  headerSub: {
    color: COLORS.primary,
    fontSize: 12,
    marginTop: 2,
  },
  scanCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success + '30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  scanCountText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    gap: 16,
  },
  permissionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    marginTop: 10,
  },
  permissionBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cameraContainer: {
    flex: 1,
  },
  overlayMask: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  targetFrame: {
    width: 250,
    height: 250,
    borderRadius: RADIUS.lg,
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: COLORS.primary,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  scanLaser: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: 3,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  instructionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    textAlign: 'center',
  },
  resultCard: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.lg,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 20,
  },
  resultSuccess: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 2,
    borderColor: COLORS.success,
  },
  resultError: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 2,
    borderColor: COLORS.danger,
    justifyContent: 'center',
  },
  resultPhotoWrap: {
    width: 54,
    height: 64,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  resultPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  resultPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultDetails: {
    flex: 1,
    gap: 3,
  },
  resultName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  resultMeta: {
    color: '#94A3B8',
    fontSize: 11,
  },
  resultStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginTop: 2,
  },
  resultStatusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  errorWrap: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 25,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toolBtn: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  toolBtnActive: {
    borderColor: COLORS.warning,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  toolBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  finishBtn: {
    flex: 1,
    height: 54,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.button,
  },
  finishBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
