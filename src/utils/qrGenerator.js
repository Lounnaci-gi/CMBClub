// src/utils/qrGenerator.js
// Générateur QR Code léger en SVG & Data URL (sans dépendance externe lourde)

/**
 * Génère l'URL d'un QR code pour affichage ou impression HTML
 */
export function getQrCodeImageUrl(dataText, size = 200) {
  const encoded = encodeURIComponent(typeof dataText === 'object' ? JSON.stringify(dataText) : String(dataText));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=2`;
}

/**
 * Construit l'objet des données de l'adhérent pour le QR Code
 */
export function buildAdherentQrData(adherent, categoryLabel) {
  return {
    code: adherent.code || '',
    nom: adherent.nom || '',
    prenom: adherent.prenom || '',
    dateNaissance: adherent.dateNaissance || '',
    lieuNaissance: adherent.lieuNaissance || '',
    telephone: adherent.telephone || '',
    discipline: adherent.discipline || '',
    categorie: categoryLabel || '',
    groupeSanguin: adherent.groupeSanguin || '',
  };
}
