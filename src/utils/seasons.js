// src/utils/seasons.js
// Helpers pour la gestion des saisons

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Génère le label d'une saison à partir d'une année de début
 */
export function generateSeasonLabel(year) {
  return `${year}-${year + 1}`;
}

/**
 * Retourne la saison courante basée sur la date actuelle
 * La saison commence en septembre et se termine en juin
 */
export function getCurrentSeasonYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  return month >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Liste des mois d'une saison (Sep à Juin)
 */
export function getSeasonMonths(seasonYear) {
  const months = [];
  for (let m = 9; m <= 12; m++) {
    months.push({ year: seasonYear, month: m, label: getMonthLabel(m, seasonYear) });
  }
  for (let m = 1; m <= 6; m++) {
    months.push({ year: seasonYear + 1, month: m, label: getMonthLabel(m, seasonYear + 1) });
  }
  return months;
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
