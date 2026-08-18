// src/utils/creneaux.js

export const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/**
 * Retourne le nom du jour de la semaine en français (ex: 'Mardi')
 */
export function getTodayJour(date = new Date()) {
  return JOURS_FR[date.getDay()];
}

/**
 * Retourne la date au format 'YYYY-MM-DD' en tenant compte du fuseau local
 */
export function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retourne l'heure au format 'HH:MM'
 */
export function getCurrentTimeString(now = new Date()) {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Convertit une chaîne d'heure 'HH:MM' en minutes depuis minuit.
 * Retourne null si le format est invalide.
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Vérifie si l'heure actuelle dépasse de plus de 20 minutes le début d'un créneau
 */
export function isLateBy20Min(heureDebutStr, now = new Date()) {
  if (!heureDebutStr) return false;
  const slotMinutes = parseTimeToMinutes(heureDebutStr);
  if (slotMinutes === null) return false;
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
  return currentTotalMinutes > slotMinutes + 20;
}

/**
 * Construit un objet Date à partir d'une date 'YYYY-MM-DD' et d'une heure 'HH:MM'
 */
export function getSlotStartDateTime(dateStr, heureDebutStr) {
  if (!dateStr || !heureDebutStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const match = String(heureDebutStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return new Date(parts[0], parts[1] - 1, parts[2], hours, minutes, 0);
}

/**
 * Retourne la date YYYY-MM-DD la plus récente (passé ou aujourd'hui) correspondant à un jour donné
 */
export function getDateForJour(jourName, baseDate = new Date()) {
  const targetIdx = JOURS_FR.indexOf(jourName);
  if (targetIdx === -1) return getLocalDateString(baseDate);
  const currentIdx = baseDate.getDay();
  let diffDays = (targetIdx - currentIdx + 7) % 7;
  if (diffDays > 0) diffDays -= 7; // occurrence la plus récente (passé ou aujourd'hui)
  const d = new Date(baseDate);
  d.setDate(d.getDate() + diffDays);
  return getLocalDateString(d);
}

/**
 * Calcule la prochaine occurrence future d'un créneau (semaine suivante si même jour)
 */
export function getNextOccurrenceDateTime(jourName, heureDebutStr, baseDate = new Date()) {
  const targetIdx = JOURS_FR.indexOf(jourName);
  if (targetIdx === -1) return null;
  const match = String(heureDebutStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const currentIdx = baseDate.getDay();
  let diffDays = (targetIdx - currentIdx + 7) % 7;
  if (diffDays === 0) diffDays = 7; // toujours la prochaine semaine si même jour
  const d = new Date(baseDate);
  d.setDate(d.getDate() + diffDays);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Détermine le statut d'un créneau par rapport à une date/heure donnée :
 * - 'ongoing'   : en cours (heureDebut <= now <= heureFin)
 * - 'upcoming'  : pas encore commencé aujourd'hui (now < heureDebut)
 * - 'ended'     : terminé (now > heureFin ou pas le bon jour)
 * - 'not_today' : créneau prévu un autre jour de la semaine
 */
export function getSlotStatus(creneau, now = new Date()) {
  if (!creneau || !creneau.heureDebut) return 'unknown';
  const todayJourName = getTodayJour(now);
  if (creneau.jour && creneau.jour !== todayJourName) {
    return 'not_today';
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = parseTimeToMinutes(creneau.heureDebut);
  const endMin = parseTimeToMinutes(creneau.heureFin);

  if (startMin === null) return 'unknown';
  // Si heureFin non renseignée, 90 minutes par défaut
  const effectiveEndMin = endMin !== null ? endMin : startMin + 90;

  if (nowMin < startMin) {
    return 'upcoming';
  } else if (nowMin <= effectiveEndMin) {
    return 'ongoing';
  } else {
    return 'ended';
  }
}

/**
 * Trouve le créneau actuel ou le premier créneau à venir non terminé pour aujourd'hui.
 * Retourne :
 * {
 *   slot: object | null,
 *   status: 'ongoing' | 'upcoming' | 'ended' | 'no_slots',
 *   reason: 'found' | 'all_slots_ended' | 'no_slots_today',
 *   todaySlots: array,
 *   todayJour: string
 * }
 */
export function findActiveOrUpcomingSlotToday(creneaux = [], now = new Date()) {
  const todayJour = getTodayJour(now);
  const todaySlots = (creneaux || []).filter(c => c.jour === todayJour);

  if (todaySlots.length === 0) {
    return {
      slot: null,
      status: 'no_slots',
      reason: 'no_slots_today',
      todaySlots: [],
      todayJour,
    };
  }

  // Tri chronologique selon l'heure de début
  const sorted = [...todaySlots].sort((a, b) => {
    const startA = parseTimeToMinutes(a.heureDebut) ?? 0;
    const startB = parseTimeToMinutes(b.heureDebut) ?? 0;
    return startA - startB;
  });

  // 1. Chercher un créneau actuellement en cours
  const ongoingSlot = sorted.find(c => getSlotStatus(c, now) === 'ongoing');
  if (ongoingSlot) {
    return {
      slot: ongoingSlot,
      status: 'ongoing',
      reason: 'found',
      todaySlots: sorted,
      todayJour,
    };
  }

  // 2. Chercher le premier créneau à venir aujourd'hui
  const upcomingSlot = sorted.find(c => getSlotStatus(c, now) === 'upcoming');
  if (upcomingSlot) {
    return {
      slot: upcomingSlot,
      status: 'upcoming',
      reason: 'found',
      todaySlots: sorted,
      todayJour,
    };
  }

  // 3. Tous les créneaux d'aujourd'hui sont terminés
  return {
    slot: null,
    status: 'ended',
    reason: 'all_slots_ended',
    todaySlots: sorted,
    todayJour,
  };
}
