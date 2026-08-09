// src/components/AdherentCardModal.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Image,
  ActivityIndicator, ScrollView, Alert, Platform,
} from 'react-native';
import * as Print from 'expo-print';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SHADOWS } from '../theme/colors';
import { getCategoryByAge } from '../utils/categories';
import { formatDate } from '../utils/seasons';
import { getQrCodeImageUrl, buildAdherentQrData } from '../utils/qrGenerator';

export default function AdherentCardModal({ visible, adherent, onClose }) {
  const [printing, setPrinting] = useState(false);

  if (!adherent) return null;

  const category = adherent.dateNaissance ? getCategoryByAge(adherent.dateNaissance) : { label: 'Inconnu', color: COLORS.primary, icon: '⚽' };
  const qrData = buildAdherentQrData(adherent, category.label);
  const qrImageUrl = getQrCodeImageUrl(qrData);

  const generatePrintableHtml = () => {
    const photoHtml = adherent.photo
      ? `<img src="${adherent.photo}" style="width: 100px; height: 120px; object-fit: cover; border-radius: 8px; border: 2px solid #1DD1A1;" />`
      : `<div style="width: 100px; height: 120px; border-radius: 8px; background-color: #162A3B; display: flex; align-items: center; justify-content: center; font-size: 40px; border: 2px solid #1DD1A1;">${category.icon}</div>`;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Carte d'adhérent - ${adherent.prenom} ${adherent.nom}</title>

          <style>
            @page {
              size: A4 portrait;
              margin: 20mm;
            }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #ffffff;
              margin: 0;
              padding: 20px;
              color: #0F172A;
            }
            .card-wrapper {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 20px;
            }
            .card {
              width: 85.6mm;
              height: 53.98mm;
              background: linear-gradient(135deg, #0A1520 0%, #162A3B 100%);
              border-radius: 12px;
              box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
              color: #ffffff;
              padding: 12px 14px;
              box-sizing: border-box;
              position: relative;
              overflow: hidden;
              border: 1px solid rgba(255, 255, 255, 0.15);
              page-break-inside: avoid;
            }
            .card-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2px solid #1DD1A1;
              padding-bottom: 6px;
              margin-bottom: 8px;
            }
            .logo-title {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .logo-title h1 {
              margin: 0;
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 1px;
              color: #FFFFFF;
            }
            .subtitle {
              font-size: 9px;
              color: #94A3B8;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .season-badge {
              background-color: rgba(29, 209, 161, 0.2);
              color: #1DD1A1;
              border: 1px solid #1DD1A1;
              padding: 2px 6px;
              border-radius: 10px;
              font-size: 8px;
              font-weight: 700;
            }
            .card-body {
              display: flex;
              gap: 10px;
              align-items: flex-start;
            }
            .photo-box {
              flex-shrink: 0;
              text-align: center;
            }
            .photo-img {
              width: 62px;
              height: 74px;
              object-fit: cover;
              border-radius: 6px;
              border: 1.5px solid #1DD1A1;
            }
            .photo-placeholder {
              width: 62px;
              height: 74px;
              border-radius: 6px;
              background-color: rgba(255,255,255,0.08);
              border: 1.5px dashed #1DD1A1;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 26px;
            }
            .cat-tag {
              display: inline-block;
              margin-top: 4px;
              background-color: ${category.color}30;
              color: ${category.color};
              font-size: 7.5px;
              font-weight: 800;
              padding: 2px 4px;
              border-radius: 4px;
              text-transform: uppercase;
            }
            .info-box {
              flex: 1;
              display: flex;
              flex-direction: column;
              gap: 3px;
              min-width: 0;
            }
            .name {
              font-size: 13px;
              font-weight: 800;
              color: #FFFFFF;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .code-pill {
              display: inline-block;
              background-color: rgba(255,255,255,0.12);
              color: #F1F5F9;
              font-family: monospace;
              font-size: 8.5px;
              font-weight: 700;
              padding: 2px 5px;
              border-radius: 4px;
              letter-spacing: 0.5px;
              align-self: flex-start;
            }
            .field-row {
              font-size: 8.5px;
              color: #CBD5E1;
              display: flex;
              gap: 4px;
            }
            .field-label {
              color: #94A3B8;
              font-weight: 600;
            }
            .field-val {
              color: #F8FAFC;
              font-weight: 700;
            }
            .qr-box {
              flex-shrink: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 2px;
              background-color: #FFFFFF;
              padding: 4px;
              border-radius: 6px;
            }
            .qr-img {
              width: 58px;
              height: 58px;
            }
            .qr-sub {
              font-size: 6px;
              color: #0F172A;
              font-weight: 700;
              text-align: center;
            }
            .print-btn-area {
              margin-top: 30px;
              text-align: center;
            }
            @media print {
              .print-btn-area { display: none; }
              body { background: white; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="card-wrapper">
            <div class="card">
              <div class="card-header">
                <div class="logo-title">
                  <span style="font-size: 16px;">🏆</span>
                  <div>
                    <h1>CMB CLUB</h1>
                    <div class="subtitle">Carte Officielle d'Adhérent</div>
                  </div>
                </div>
                <div class="season-badge">2025-2026</div>
              </div>

              <div class="card-body">
                <div class="photo-box">
                  ${photoHtml}
                  <div class="cat-tag">${category.icon} ${category.label}</div>
                </div>

                <div class="info-box">
                  <div class="name">${adherent.prenom} ${adherent.nom}</div>
                  <div class="code-pill">${adherent.code}</div>

                  <div class="field-row" style="margin-top: 2px;">
                    <span class="field-label">Né(e) :</span>
                    <span class="field-val">${formatDate(adherent.dateNaissance)} à ${adherent.lieuNaissance || '—'}</span>
                  </div>

                  <div class="field-row">
                    <span class="field-label">Tél :</span>
                    <span class="field-val">${adherent.telephone || '—'}</span>
                  </div>

                  <div class="field-row">
                    <span class="field-label">Discipline :</span>
                    <span class="field-val" style="color: #1DD1A1;">${adherent.discipline || '—'}</span>
                  </div>

                  ${adherent.groupeSanguin ? `
                    <div class="field-row">
                      <span class="field-label">Gr. sanguin :</span>
                      <span class="field-val" style="color: #FF6B6B;">${adherent.groupeSanguin}</span>
                    </div>
                  ` : ''}
                </div>

                <div class="qr-box">
                  <img src="${qrImageUrl}" class="qr-img" alt="QR Code" />
                  <div class="qr-sub">SCAN QR</div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const html = generatePrintableHtml();
      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Erreur d\'impression', e.message);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBg}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="badge-account-horizontal" size={24} color={COLORS.primary} />
              <Text style={styles.title}>Carte d'Adhérent</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Visual Card Component on Screen */}
            <View style={styles.cardVisual}>
              <View style={styles.cardHeaderVisual}>
                <View style={styles.logoRow}>
                  <View style={styles.logoCircle}>
                    <MaterialCommunityIcons name="trophy" size={18} color={COLORS.secondary} />
                  </View>
                  <View>
                    <Text style={styles.clubTitle}>CMB CLUB</Text>
                    <Text style={styles.clubSub}>Carte Officielle d'Adhérent</Text>
                  </View>
                </View>
                <View style={styles.seasonBadge}>
                  <Text style={styles.seasonText}>2025 - 2026</Text>
                </View>
              </View>

              <View style={styles.cardBodyVisual}>
                {/* Photo & Category */}
                <View style={styles.photoContainer}>
                  {adherent.photo ? (
                    <Image source={{ uri: adherent.photo }} style={styles.photoImg} />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={{ fontSize: 32 }}>{category.icon}</Text>
                    </View>
                  )}
                  <View style={[styles.categoryBadge, { backgroundColor: category.color + '25', borderColor: category.color }]}>
                    <Text style={[styles.categoryBadgeText, { color: category.color }]}>
                      {category.icon} {category.label}
                    </Text>
                  </View>
                </View>

                {/* Information Fields */}
                <View style={styles.detailsContainer}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {adherent.prenom} {adherent.nom}
                  </Text>
                  <View style={styles.codeBadge}>
                    <MaterialCommunityIcons name="barcode" size={13} color={COLORS.primary} />
                    <Text style={styles.codeBadgeText}>{adherent.code}</Text>
                  </View>

                  <View style={styles.infoLine}>
                    <MaterialCommunityIcons name="cake-variant" size={13} color={COLORS.textMuted} />
                    <Text style={styles.infoLineText}>
                      Né(e) le {formatDate(adherent.dateNaissance)} {adherent.lieuNaissance ? `à ${adherent.lieuNaissance}` : ''}
                    </Text>
                  </View>

                  <View style={styles.infoLine}>
                    <MaterialCommunityIcons name="phone" size={13} color={COLORS.textMuted} />
                    <Text style={styles.infoLineText}>{adherent.telephone || '—'}</Text>
                  </View>

                  <View style={styles.infoLine}>
                    <MaterialCommunityIcons name="run" size={13} color={COLORS.primary} />
                    <Text style={[styles.infoLineText, { color: COLORS.primary, fontWeight: '700' }]}>
                      {adherent.discipline || '—'}
                    </Text>
                  </View>

                  {adherent.groupeSanguin ? (
                    <View style={styles.infoLine}>
                      <MaterialCommunityIcons name="water" size={13} color={COLORS.danger} />
                      <Text style={[styles.infoLineText, { color: COLORS.danger, fontWeight: '700' }]}>
                        Gr. Sanguin : {adherent.groupeSanguin}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* QR Code Container */}
                <View style={styles.qrContainer}>
                  <Image source={{ uri: qrImageUrl }} style={styles.qrImage} />
                  <Text style={styles.qrLabel}>SCAN QR</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.printButton}
              onPress={handlePrint}
              activeOpacity={0.85}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="printer" size={20} color="#fff" />
                  <Text style={styles.printButtonText}>Imprimer la carte</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  cardVisual: {
    backgroundColor: '#0A1520',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    gap: 12,
    ...SHADOWS.card,
  },
  cardHeaderVisual: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubTitle: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
  },
  clubSub: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  seasonBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  seasonText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  cardBodyVisual: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  photoContainer: {
    alignItems: 'center',
    gap: 6,
  },
  photoImg: {
    width: 70,
    height: 85,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    width: 70,
    height: 85,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  detailsContainer: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
  },
  codeBadgeText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoLineText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  qrContainer: {
    backgroundColor: '#FFF',
    padding: 6,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    gap: 2,
  },
  qrImage: {
    width: 68,
    height: 68,
  },
  qrLabel: {
    color: '#0F172A',
    fontSize: 8,
    fontWeight: '800',
  },
  qrDataInfoBox: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  qrDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qrDataTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  qrDataText: {
    color: COLORS.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    backgroundColor: COLORS.bgCard,
    padding: 8,
    borderRadius: RADIUS.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  printButton: {
    flex: 2,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.button,
  },
  printButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
});
