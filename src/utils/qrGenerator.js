// src/utils/qrGenerator.js
// Générateur QR Code léger avec données lisibles au scan (sans JSON)

import { formatDate } from './seasons';

/**
 * Génère l'URL d'un QR code pour affichage ou impression HTML
 */
export function getQrCodeImageUrl(dataText, size = 250) {
  const textToEncode = typeof dataText === 'object' && dataText !== null
    ? buildAdherentQrText(dataText)
    : String(dataText);
  const encoded = encodeURIComponent(textToEncode);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=2`;
}

/**
 * Formate les données de l'adhérent en texte structuré lisible au scan
 */
export function buildAdherentQrText(dataObj) {
  if (typeof dataObj === 'string') return dataObj;

  const lines = [
    `🏆 CMB CLUB — CARTE ADHÉRENT`,
    dataObj.saison ? `Saison : ${dataObj.saison}` : null,
    `--------------------------------`,
    `ID Code : ${dataObj.code || '—'}`,
    `Nom & Prénom : ${(dataObj.nom || '').toUpperCase()} ${dataObj.prenom || ''}`,
    `Date de Naissance : ${dataObj.dateNaissance ? formatDate(dataObj.dateNaissance) : '—'}`,
    `Lieu de Naissance : ${dataObj.lieuNaissance || '—'}`,
    `Discipline : ${dataObj.discipline || '—'}`,
    `Catégorie : ${dataObj.categorie || '—'}`,
    `Téléphone : ${dataObj.telephone || '—'}`,
    `Groupe Sanguin : ${dataObj.groupeSanguin || '—'}`,
    `Statut Assurance : ${dataObj.assure ? 'Assuré 🛡️' : 'Non assuré ❌'}`,
  ];

  return lines.filter(line => line !== null).join('\n');
}

/**
 * Construit les données texte de l'adhérent pour le QR Code
 */
export function buildAdherentQrData(adherent, categoryLabel, saisonActive) {
  if (!adherent) return '';
  return buildAdherentQrText({
    code: adherent.code || '',
    nom: adherent.nom || '',
    prenom: adherent.prenom || '',
    dateNaissance: adherent.dateNaissance || '',
    lieuNaissance: adherent.lieuNaissance || '',
    telephone: adherent.telephone || '',
    discipline: adherent.discipline || '',
    categorie: categoryLabel || '',
    groupeSanguin: adherent.groupeSanguin || '',
    assure: Boolean(adherent.assure),
    saison: saisonActive ? saisonActive.label : '',
  });
}
