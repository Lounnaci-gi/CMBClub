// src/utils/seasons.js
// Helpers pour la gestion des saisons

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
  const date = new Date(year, month - 1, 1);
  return format(date, 'MMMM yyyy', { locale: fr });
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), "dd/MM/yyyy HH'h'mm");
  } catch {
    return dateStr;
  }
}
