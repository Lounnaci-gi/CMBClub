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

/**
 * Normalise une chaîne d'identité (nom, prénom) pour comparaison insensible à la casse, aux accents et aux espaces superflus
 */
export function normalizeIdentityString(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Vérifie si deux profils correspondent au même adhérent (nom, prénom, dateNaissance)
 */
export function isSameAdherentIdentity(a1, a2) {
  if (!a1 || !a2) return false;
  if (!a1.nom || !a1.prenom || !a1.dateNaissance || !a2.nom || !a2.prenom || !a2.dateNaissance) {
    return false;
  }
  const nom1 = normalizeIdentityString(a1.nom);
  const nom2 = normalizeIdentityString(a2.nom);
  const prenom1 = normalizeIdentityString(a1.prenom);
  const prenom2 = normalizeIdentityString(a2.prenom);
  const date1 = String(a1.dateNaissance).trim();
  const date2 = String(a2.dateNaissance).trim();

  return Boolean(nom1 && nom2 && nom1 === nom2 && prenom1 === prenom2 && date1 === date2);
}

/**
 * Recherche un doublon dans une liste d'adhérents
 */
export function findAdherentDuplicate(list, target, excludeId = null) {
  if (!list || !Array.isArray(list) || !target) return null;
  if (!target.nom || !target.prenom || !target.dateNaissance) return null;
  return list.find(item => {
    if (excludeId && item.id === excludeId) return false;
    if (target.id && item.id === target.id) return false;
    return isSameAdherentIdentity(item, target);
  }) || null;
}

