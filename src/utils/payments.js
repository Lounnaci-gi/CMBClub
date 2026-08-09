// src/utils/payments.js
// Calcul des paiements, retards et statuts

import { getSeasonMonths } from './seasons';

export const PAYMENT_TYPES = {
  INSCRIPTION: 'inscription',
  MENSUALITE: 'mensualite',
};

export const PAYMENT_STATUS = {
  PAYE: 'paye',
  AVANCE: 'avance',
  EN_RETARD: 'en_retard',
  A_PAYER: 'a_payer',
};

/**
 * Détermine le statut d'un paiement à partir des montants et de l'échéance
 */
export function computePaymentStatus(paiement) {
  const net = (paiement.montantDu || 0) - (paiement.remiseMontant || 0);
  const paye = paiement.montantPaye || 0;

  // Totalement payé
  if (paye >= net && net >= 0) {
    return PAYMENT_STATUS.PAYE;
  }

  // Partiellement payé (avance)
  if (paye > 0 && paye < net) {
    return PAYMENT_STATUS.AVANCE;
  }

  // Rien payé — vérifier si en retard
  const mois = paiement.mois ?? paiement.month;
  const annee = paiement.annee ?? paiement.year;
  if (mois && annee) {
    const dueDate = new Date(annee, mois - 1, 10);
    if (new Date() > dueDate) return PAYMENT_STATUS.EN_RETARD;
  } else if (paiement.type === PAYMENT_TYPES.INSCRIPTION) {
    if (paiement.createdAt) {
      const created = new Date(paiement.createdAt);
      const limit = new Date(created);
      limit.setDate(limit.getDate() + 30);
      if (new Date() > limit) return PAYMENT_STATUS.EN_RETARD;
    }
  }
  return PAYMENT_STATUS.A_PAYER;
}

/**
 * Calcule le solde restant d'un adhérent pour une saison
 */
export function calculateBalance(paiements) {
  const totalDu = paiements.reduce((sum, p) => sum + (p.montantDu || 0), 0);
  const totalPaye = paiements.reduce((sum, p) => sum + (p.montantPaye || 0), 0);
  const totalRemise = paiements.reduce((sum, p) => sum + (p.remiseMontant || 0), 0);
  return {
    totalDu,
    totalPaye,
    totalRemise,
    solde: totalDu - totalPaye - totalRemise,
  };
}

/**
 * Génère la grille de paiements attendus pour un adhérent dans une saison
 */
export function generatePaymentSchedule(saisonAnnee, config, dateInscription) {
  const schedule = [];
  const months = getSeasonMonths(saisonAnnee);

  // Frais d'inscription
  schedule.push({
    type: PAYMENT_TYPES.INSCRIPTION,
    label: 'Frais d\'inscription',
    montantDu: config.fraisInscription,
    month: null,
    year: null,
  });

  // Mensualités à partir du mois d'inscription
  const inscDate = dateInscription ? new Date(dateInscription) : new Date();
  const inscMonth = inscDate.getMonth() + 1;
  const inscYear = inscDate.getFullYear();

  months.forEach(({ month, year, label }) => {
    // Inclure seulement les mois à partir du mois d'inscription
    const monthDate = new Date(year, month - 1, 1);
    const startDate = new Date(inscYear, inscMonth - 1, 1);
    if (monthDate >= startDate) {
      schedule.push({
        type: PAYMENT_TYPES.MENSUALITE,
        label: `Mensualité – ${label}`,
        montantDu: config.fraisMensuel,
        month,
        year,
      });
    }
  });

  return schedule;
}

export function getStatusColor(status) {
  switch (status) {
    case PAYMENT_STATUS.PAYE: return '#1DD1A1';
    case PAYMENT_STATUS.AVANCE: return '#54A0FF';
    case PAYMENT_STATUS.EN_RETARD: return '#EE5A24';
    case PAYMENT_STATUS.A_PAYER: return '#F9CA24';
    default: return '#888';
  }
}

export function getStatusLabel(status) {
  switch (status) {
    case PAYMENT_STATUS.PAYE: return 'Payé';
    case PAYMENT_STATUS.AVANCE: return 'Avancé';
    case PAYMENT_STATUS.EN_RETARD: return 'Non Payé';
    case PAYMENT_STATUS.A_PAYER: return 'Non Payé';
    default: return 'Inconnu';
  }
}

export function getStatusIcon(status) {
  switch (status) {
    case PAYMENT_STATUS.PAYE: return 'check-circle';
    case PAYMENT_STATUS.AVANCE: return 'circle-half-full';
    case PAYMENT_STATUS.EN_RETARD: return 'close-circle';
    case PAYMENT_STATUS.A_PAYER: return 'close-circle';
    default: return 'help-circle';
  }
}
