// src/utils/payments.js
// Calcul des paiements, retards et statuts

import { getSeasonMonths } from './seasons';

export const PAYMENT_TYPES = {
  INSCRIPTION: 'inscription',
  MENSUALITE: 'mensualite',
};

export const PAYMENT_STATUS = {
  PAYE: 'paye',
  EN_RETARD: 'en_retard',
  A_PAYER: 'a_payer',
};

export const DEFAULT_CONFIG = {
  fraisInscription: 2000,
  fraisMensuel: 1500,
};

/**
 * Calcule le montant net après remise
 */
export function applyDiscount(montant, remisePct) {
  if (!remisePct || remisePct <= 0) return montant;
  return Math.round(montant * (1 - remisePct / 100));
}

/**
 * Détermine le statut d'un paiement à partir des montants et de l'échéance
 */
export function computePaymentStatus(paiement) {
  const net = (paiement.montantDu || 0) - (paiement.remiseMontant || 0);
  if ((paiement.montantPaye || 0) >= net && net > 0) {
    return PAYMENT_STATUS.PAYE;
  }
  if ((paiement.montantPaye || 0) >= net && net === 0) {
    return PAYMENT_STATUS.PAYE;
  }

  const mois = paiement.mois ?? paiement.month;
  const annee = paiement.annee ?? paiement.year;
  if (mois && annee) {
    const dueDate = new Date(annee, mois - 1, 10);
    if (new Date() > dueDate) return PAYMENT_STATUS.EN_RETARD;
  } else if (paiement.type === PAYMENT_TYPES.INSCRIPTION) {
    // Inscription : en retard si non payée après 30 jours de création
    if (paiement.createdAt) {
      const created = new Date(paiement.createdAt);
      const limit = new Date(created);
      limit.setDate(limit.getDate() + 30);
      if (new Date() > limit && (paiement.montantPaye || 0) < net) {
        return PAYMENT_STATUS.EN_RETARD;
      }
    }
  }
  return PAYMENT_STATUS.A_PAYER;
}

/** @deprecated utiliser computePaymentStatus */
export function getPaymentStatus(paiement) {
  return computePaymentStatus(paiement);
}

/**
 * Statut global d'un adhérent pour une saison
 */
export function getAdherentPaymentSummary(paiements) {
  if (!paiements?.length) {
    return { status: 'none', hasRetard: false, allPaid: false };
  }
  const hasRetard = paiements.some(p => p.statut === PAYMENT_STATUS.EN_RETARD);
  if (hasRetard) return { status: PAYMENT_STATUS.EN_RETARD, hasRetard: true, allPaid: false };
  const allPaid = paiements.every(p => p.statut === PAYMENT_STATUS.PAYE);
  if (allPaid) return { status: PAYMENT_STATUS.PAYE, hasRetard: false, allPaid: true };
  return { status: PAYMENT_STATUS.A_PAYER, hasRetard: false, allPaid: false };
}

/**
 * Calcule le total dû pour une saison
 */
export function calculateSeasonTotal(config, nbMois = 10) {
  return config.fraisInscription + config.fraisMensuel * nbMois;
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
    case PAYMENT_STATUS.EN_RETARD: return '#EE5A24';
    case PAYMENT_STATUS.A_PAYER: return '#F9CA24';
    default: return '#888';
  }
}

export function getStatusLabel(status) {
  switch (status) {
    case PAYMENT_STATUS.PAYE: return 'Payé';
    case PAYMENT_STATUS.EN_RETARD: return 'En retard';
    case PAYMENT_STATUS.A_PAYER: return 'À payer';
    default: return 'Inconnu';
  }
}

export function getStatusIcon(status) {
  switch (status) {
    case PAYMENT_STATUS.PAYE: return 'check-circle';
    case PAYMENT_STATUS.EN_RETARD: return 'alert-circle';
    case PAYMENT_STATUS.A_PAYER: return 'clock-outline';
    default: return 'help-circle';
  }
}
