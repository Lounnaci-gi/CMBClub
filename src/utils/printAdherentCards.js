// src/utils/printAdherentCards.js
import { Image, Alert } from 'react-native';
import * as Print from 'expo-print';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { getEffectiveCategory } from './categories';
import { formatDate } from './seasons';
import { getQrCodeImageUrl, buildAdherentQrData } from './qrGenerator';

/**
 * Convertit l'URI d'une photo en base64 pour garantir son rendu à l'impression.
 */
async function resolvePhotoBase64(photo) {
  if (!photo) return null;
  if (photo.startsWith('data:image')) return photo;

  try {
    const file = new File(photo);
    const base64 = await file.base64();
    return `data:image/jpeg;base64,${base64}`;
  } catch (_e1) {
    try {
      const base64 = await FileSystem.readAsStringAsync(photo, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/jpeg;base64,${base64}`;
    } catch (_e2) {
      return photo;
    }
  }
}

/**
 * Génère le HTML d'une seule carte — copie exacte du modèle AdherentCardModal.
 * On passe `category` pour permettre l'interpolation de couleur dans le CSS de `.cat-tag`.
 */
function renderSingleCardHtml(adherent, { photoSrc, logoUri, saisonLabel, category, qrImageUrl }) {
  const photoHtml = photoSrc
    ? `<img src="${photoSrc}" class="photo-img" />`
    : `<div class="photo-placeholder">${category.icon}</div>`;

  // Copie exacte du CSS .cat-tag de AdherentCardModal.js (couleurs interpolées par carte)
  const catTagStyle = `background-color: ${category.color}35; color: ${category.color}; border: 1px solid ${category.color}60;`;

  return `
    <div class="card">
      <div class="card-header">
        <div class="logo-title">
          <img src="${logoUri}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: contain;" alt="CMB Club" />
          <div>
            <h1>CMB CLUB</h1>
            <div class="subtitle">Carte Officielle d'Adhérent</div>
          </div>
        </div>
        <div class="season-badge">${saisonLabel}</div>
      </div>

      <div class="card-body">
        <div class="photo-box">
          ${photoHtml}
          <div class="cat-tag" style="${catTagStyle}">${category.icon} ${category.label}</div>
        </div>

        <div class="info-box">
          <div class="name">${adherent.prenom} ${adherent.nom}</div>
          <div class="code-pill">${adherent.code || ''}</div>

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
        </div>
      </div>
    </div>
  `;
}

/**
 * Génère et imprime une planche A4 de cartes d'adhérents.
 * Chaque carte est strictement identique à la carte individuelle de AdherentCardModal.js.
 *
 * @param {object} params
 * @param {Array}  params.adherents - Liste des adhérents à imprimer
 * @param {object} [params.saison]  - Saison active
 */
export async function printAllAdherentCards({ adherents = [], saison = null }) {
  if (!adherents || adherents.length === 0) {
    Alert.alert('Information', 'Aucun adhérent à imprimer.');
    return;
  }

  const saisonLabel = saison?.label || '2025-2026';

  let logoUri = '';
  try {
    logoUri = Image.resolveAssetSource(require('../../assets/cmbclub.png')).uri;
  } catch (_e) {
    logoUri = '';
  }

  // Résolution parallèle de toutes les photos
  const cardsHtmlList = await Promise.all(
    adherents.map(async (adherent) => {
      const category = getEffectiveCategory(adherent);
      const qrText = buildAdherentQrData(adherent, category.label, saison);
      const qrImageUrl = getQrCodeImageUrl(qrText);
      const photoSrc = await resolvePhotoBase64(adherent.photo);

      return renderSingleCardHtml(adherent, {
        photoSrc,
        logoUri,
        saisonLabel,
        category,
        qrImageUrl,
      });
    })
  );

  const cardsGridHtml = cardsHtmlList.join('');

  // CSS identique au pixel près à celui de AdherentCardModal.generatePrintableHtml()
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Cartes d'Adhérents – CMB CLUB (${adherents.length})</title>
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
          /* Grille A4 : 2 cartes par ligne, identiques au modèle individuel */
          .cards-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 12mm 8mm;
            justify-content: center;
            align-items: flex-start;
          }
          /* ── Copie exacte du CSS de AdherentCardModal.generatePrintableHtml ── */
          .card {
            width: 85mm;
            min-height: 54mm;
            background: linear-gradient(135deg, #0A1520 0%, #162A3B 100%);
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            color: #ffffff;
            padding: 12px 14px;
            box-sizing: border-box;
            position: relative;
            overflow: visible;
            border: 1px solid rgba(255, 255, 255, 0.15);
            page-break-inside: avoid;
            break-inside: avoid;
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
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
          }
          .photo-img {
            width: 62px;
            height: 72px;
            object-fit: cover;
            border-radius: 6px;
            border: 2px solid #1DD1A1;
          }
          .photo-placeholder {
            width: 62px;
            height: 72px;
            border-radius: 6px;
            background-color: rgba(255,255,255,0.08);
            border: 1.5px dashed #1DD1A1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
          }
          .cat-tag {
            display: block;
            width: 62px;
            text-align: center;
            font-size: 7px;
            font-weight: 900;
            padding: 3px 4px;
            border-radius: 5px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            box-sizing: border-box;
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
          @media print {
            body { background: white; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="cards-grid">
          ${cardsGridHtml}
        </div>
      </body>
    </html>
  `;

  await Print.printAsync({ html });
}
