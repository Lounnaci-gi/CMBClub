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
 * Format : NOM(3) + PRENOM(2) + AAMMJJ + LIEU(3) + DISC(3)
 * Ex. : BENKA100515ALGFOO
 */
export function buildAdherentCodeBase({ nom, prenom, dateNaissance, lieuNaissance, discipline }) {
  const n = normalizePart(nom, 3).padEnd(3, 'X');
  const p = normalizePart(prenom, 2).padEnd(2, 'X');
  const date = (dateNaissance || '').replace(/-/g, '');
  const yymmdd = date.length === 8 ? date.slice(2) : '000000';
  const lieu = normalizePart(lieuNaissance, 3).padEnd(3, 'X');
  const disc = normalizePart(discipline, 3).padEnd(3, 'X');
  return `${n}${p}${yymmdd}${lieu}${disc}`;
}

/**
 * Indique si les champs nécessaires au code sont renseignés
 */
export function canGenerateAdherentCode({ nom, prenom, dateNaissance, lieuNaissance, discipline }) {
  return Boolean(
    nom?.trim() &&
    prenom?.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateNaissance || '') &&
    lieuNaissance?.trim() &&
    discipline?.trim(),
  );
}
