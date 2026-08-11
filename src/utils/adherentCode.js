// src/utils/adherentCode.js
// Génération déterministe du code adhérent

/**
 * Normalise une chaîne : sans accents, alphanumérique, majuscules
 */
function normalizePart(value, maxLen) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, maxLen);
}

/**
 * Construit la base du code à partir des infos d'identité.
 * Format : NOM(3) + PRENOM(2) + AAMMJJ(4) = 9 caractères
 * Ex. : BENKA1005   (AAMMJJ = les 4 derniers chiffres de la date, ex: 0515 pour le 15 mai)
 * Le code final est limité à 10 caractères max (suffixe de collision inclus).
 */
export function buildAdherentCodeBase({ nom, prenom, dateNaissance }) {
  const n = normalizePart(nom, 3).padEnd(3, 'X');
  const p = normalizePart(prenom, 2).padEnd(2, 'X');
  const date = (dateNaissance || '').replace(/-/g, '');
  // AAMMJJ : annee(2) + mois(2) + jour(2) -> on prend les 4 derniers chiffres MMJJ
  const mmjj = date.length === 8 ? date.slice(4) : '0000';
  const yy   = date.length === 8 ? date.slice(2, 4) : '00';
  return `${n}${p}${yy}${mmjj}`; // 3+2+2+4 = 9 chars. Il reste 1 char pour la collision.
}

/**
 * Indique si les champs nécessaires au code sont renseignés
 */
export function canGenerateAdherentCode({ nom, prenom, dateNaissance }) {
  return Boolean(
    nom?.trim() &&
    prenom?.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateNaissance || ''),
  );
}
