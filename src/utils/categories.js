// src/utils/categories.js
// Calcul automatique de la catégorie d'âge

export const CATEGORIES = [
  { label: 'Poussin',  minAge: 0,  maxAge: 7,   color: '#FF9F43', icon: '🐣' },
  { label: 'Pupille',  minAge: 8,  maxAge: 10,  color: '#54A0FF', icon: '⭐' },
  { label: 'Minime',   minAge: 11, maxAge: 13,  color: '#5F27CD', icon: '🌟' },
  { label: 'Cadet',    minAge: 14, maxAge: 16,  color: '#00D2D3', icon: '🏅' },
  { label: 'Junior',   minAge: 17, maxAge: 19,  color: '#1DD1A1', icon: '🥈' },
  { label: 'Sénior',   minAge: 20, maxAge: 34,  color: '#EE5A24', icon: '🥇' },
  { label: 'Vétéran',  minAge: 35, maxAge: 200, color: '#C8D6E5', icon: '🏆' },
];

export const DISCIPLINES = ['KickBoxing', 'Natation'];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * Calcule l'âge en années à partir d'une date de naissance
 */
export function calculateAge(dateNaissance) {
  if (!dateNaissance) return 0;
  const today = new Date();
  const birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Retourne la catégorie d'âge d'un adhérent
 */
export function getCategoryByAge(dateNaissance) {
  const age = calculateAge(dateNaissance);
  return CATEGORIES.find(c => age >= c.minAge && age <= c.maxAge) || CATEGORIES[CATEGORIES.length - 1];
}

/**
 * Retourne la catégorie effective d'un adhérent :
 * - Si l'admin a forcé une catégorie (categorieOverride), elle est prioritaire
 * - Sinon, la catégorie est calculée automatiquement depuis la date de naissance
 */
export function getEffectiveCategory(adherent) {
  if (adherent?.categorieOverride) {
    const found = CATEGORIES.find(c => c.label === adherent.categorieOverride);
    if (found) return { ...found, isOverride: true };
  }
  return getCategoryByAge(adherent?.dateNaissance);
}


