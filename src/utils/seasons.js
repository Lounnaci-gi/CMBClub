// src/utils/seasons.js
// Helpers pour la gestion des saisons (Ultra-léger & sans dépendance externe)

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/**
 * Génère le label d'une saison à partir d'une année
 */
export function generateSeasonLabel(year) {
  return String(year);
}

/**
 * Retourne la saison courante basée sur la date actuelle (année civile 1er Jan au 31 Déc)
 */
export function getCurrentSeasonYear() {
  return new Date().getFullYear();
}

/**
 * Liste des mois d'une saison (1er Janvier au 31 Décembre)
 */
export function getSeasonMonths(seasonYear) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ year: seasonYear, month: m, label: getMonthLabel(m, seasonYear) });
  }
  return months;
}

/**
 * Vérifie si la création d'une saison est autorisée
 * - Année <= année en cours : Autorisé
 * - Année = année en cours + 1 : Autorisé seulement à partir du 22 décembre de l'année en cours (10 jours avant la fin d'année)
 * - Année > année en cours + 1 : Interdit
 */
export function canCreateSeason(targetYear) {
  const now = new Date();
  const currentYear = now.getFullYear();

  if (targetYear <= currentYear) {
    return { allowed: true };
  }

  if (targetYear === currentYear + 1) {
    const allowedStartDate = new Date(currentYear, 11, 22); // 22 Décembre
    if (now >= allowedStartDate) {
      return { allowed: true };
    } else {
      return {
        allowed: false,
        reason: `Impossible de créer la saison ${targetYear} car l'année ${currentYear} n'est pas encore terminée.\n\nLa création de la saison ${targetYear} est autorisée seulement 10 jours avant la fin de l'année (à partir du 22 décembre ${currentYear}).`,
      };
    }
  }

  return {
    allowed: false,
    reason: `Impossible de créer la saison ${targetYear}. L'année ${currentYear} n'est pas terminée.`,
  };
}

export function getMonthLabel(month, year) {
  const monthName = MOIS_FR[(month - 1) % 12] || '';
  return `${monthName} ${year}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}h${mins}`;
  } catch {
    return dateStr;
  }
}
