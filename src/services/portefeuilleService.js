/**
 * Service métier portefeuille — pur et testable (sans I/O).
 *
 * Trois flux : inscription (par saison), mensualité (mois écoulés), assurance annuelle.
 * Imputation automatique d'un versement : inscription → mensualités dues (ancien→récent) → mois futurs.
 */

import { getMonthLabel } from '../utils/seasons';

export const CREANCE_TYPES = {
  INSCRIPTION: 'inscription',
  MENSUALITE: 'mensualite',
  ASSURANCE: 'assurance',
};

export const CREANCE_STATUS = {
  NON_PAYE: 'non_paye',
  PARTIEL: 'partiel',
  PAYE: 'paye',
  PAYE_AVANCE: 'paye_avance',
};

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ymKey(annee, mois) {
  return (Number(annee) || 0) * 100 + (Number(mois) || 0);
}

function parseAsOf(asOfDate) {
  if (!asOfDate) return new Date();
  if (asOfDate instanceof Date) return asOfDate;
  return new Date(asOfDate);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthsFromTo(startDate, endDate) {
  const months = [];
  let cursor = startOfMonth(startDate);
  const end = startOfMonth(endDate);
  while (cursor <= end) {
    months.push({ mois: cursor.getMonth() + 1, annee: cursor.getFullYear() });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

function inscriptionStart(dateInscription, saisonAnnee) {
  const insc = dateInscription ? new Date(dateInscription) : new Date(saisonAnnee, 0, 1);
  const seasonStart = new Date(saisonAnnee, 0, 1);
  const seasonEnd = new Date(saisonAnnee, 11, 31);
  if (insc < seasonStart || insc > seasonEnd) return seasonStart;
  return startOfMonth(insc);
}

export function resteDu(creance) {
  return roundMoney(Math.max(0, (creance.montantDu || 0) - (creance.montantPaye || 0)));
}

/**
 * Statut d'une créance selon montants et échéance (mois courant / futur).
 */
export function computeCreanceStatus(creance, asOfDate = new Date()) {
  const due = creance.montantDu || 0;
  const paid = creance.montantPaye || 0;
  const asOf = parseAsOf(asOfDate);

  if (paid <= 0) return CREANCE_STATUS.NON_PAYE;
  if (paid < due) return CREANCE_STATUS.PARTIEL;

  if (creance.type === CREANCE_TYPES.MENSUALITE && creance.mois && creance.annee) {
    const monthStart = new Date(creance.annee, creance.mois - 1, 1);
    if (monthStart > startOfMonth(asOf)) return CREANCE_STATUS.PAYE_AVANCE;
  }
  return CREANCE_STATUS.PAYE;
}

/**
 * Tarif mensuel effectif pour une saison : personnalisé si défini, sinon tarif de base.
 * Jamais reconduit automatiquement d'une saison à l'autre (le tarif perso est scopé saison).
 */
export function resolveTarifMensuel(tarifBase, tarifPersonnalise) {
  if (tarifPersonnalise != null && tarifPersonnalise !== '' && !Number.isNaN(Number(tarifPersonnalise))) {
    return roundMoney(Number(tarifPersonnalise));
  }
  return roundMoney(tarifBase);
}

/**
 * Génère les créances manquantes jusqu'au mois courant (jamais toute la saison d'avance).
 * Retourne uniquement les nouvelles créances à créer.
 */
export function genererCreancesMois({
  adherentId,
  saisonId,
  saisonAnnee,
  dateInscription,
  asOfDate = new Date(),
  fraisInscription = 0,
  fraisAssurance = 0,
  tarifMensuel = 0,
  assure = false,
  existingCreances = [],
}) {
  const asOf = parseAsOf(asOfDate);
  const currentYm = ymKey(asOf.getFullYear(), asOf.getMonth() + 1);
  const start = inscriptionStart(dateInscription, saisonAnnee);
  const dueMonths = monthsFromTo(start, asOf).filter(
    (m) => m.annee === saisonAnnee && ymKey(m.annee, m.mois) <= currentYm,
  );

  const existing = existingCreances || [];
  const hasType = (type, mois = null, annee = null) =>
    existing.some((c) => {
      if (c.type !== type) return false;
      if (mois == null) return true;
      return Number(c.mois) === Number(mois) && Number(c.annee) === Number(annee);
    });

  const nouvelles = [];

  if (fraisInscription > 0 && !hasType(CREANCE_TYPES.INSCRIPTION)) {
    nouvelles.push({
      adherentId,
      saisonId,
      type: CREANCE_TYPES.INSCRIPTION,
      label: "Frais d'inscription",
      mois: null,
      annee: null,
      montantDu: roundMoney(fraisInscription),
      montantPaye: 0,
      statut: CREANCE_STATUS.NON_PAYE,
    });
  }

  if (assure && fraisAssurance > 0 && !hasType(CREANCE_TYPES.ASSURANCE)) {
    nouvelles.push({
      adherentId,
      saisonId,
      type: CREANCE_TYPES.ASSURANCE,
      label: 'Assurance annuelle',
      mois: null,
      annee: null,
      montantDu: roundMoney(fraisAssurance),
      montantPaye: 0,
      statut: CREANCE_STATUS.NON_PAYE,
    });
  }

  for (const { mois, annee } of dueMonths) {
    if (hasType(CREANCE_TYPES.MENSUALITE, mois, annee)) continue;
    nouvelles.push({
      adherentId,
      saisonId,
      type: CREANCE_TYPES.MENSUALITE,
      label: `Mensualité – ${getMonthLabel(mois, annee)}`,
      mois,
      annee,
      montantDu: roundMoney(tarifMensuel),
      montantPaye: 0,
      statut: CREANCE_STATUS.NON_PAYE,
    });
  }

  return nouvelles;
}

/**
 * Ordonne les créances pour imputation :
 * 1) inscription impayée, 2) assurance impayée, 3) mensualités dues (ancien→récent),
 * 4) mensualités futures déjà créées, 5) (appelant peut en créer d'autres).
 */
export function orderCreancesForImputation(creances, asOfDate = new Date()) {
  const asOf = parseAsOf(asOfDate);
  const currentYm = ymKey(asOf.getFullYear(), asOf.getMonth() + 1);

  const unpaid = (creances || []).filter((c) => resteDu(c) > 0);

  const rank = (c) => {
    if (c.type === CREANCE_TYPES.INSCRIPTION) return 0;
    if (c.type === CREANCE_TYPES.ASSURANCE) return 1;
    if (c.type === CREANCE_TYPES.MENSUALITE) {
      const key = ymKey(c.annee, c.mois);
      return key <= currentYm ? 2 : 3;
    }
    return 9;
  };

  return unpaid.slice().sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.type === CREANCE_TYPES.MENSUALITE && b.type === CREANCE_TYPES.MENSUALITE) {
      return ymKey(a.annee, a.mois) - ymKey(b.annee, b.mois);
    }
    return 0;
  });
}

/**
 * Crée une créance de mensualité future (paiement d'avance) pour un mois donné.
 */
export function buildFutureMensualite({
  adherentId,
  saisonId,
  mois,
  annee,
  tarifMensuel,
}) {
  return {
    adherentId,
    saisonId,
    type: CREANCE_TYPES.MENSUALITE,
    label: `Mensualité – ${getMonthLabel(mois, annee)}`,
    mois,
    annee,
    montantDu: roundMoney(tarifMensuel),
    montantPaye: 0,
    statut: CREANCE_STATUS.NON_PAYE,
    _tempId: `future-${annee}-${mois}`,
  };
}

/**
 * Prochain mois calendaire après (annee, mois), borné à la saison.
 */
export function nextSeasonMonth(annee, mois, saisonAnnee) {
  let m = Number(mois) + 1;
  let y = Number(annee);
  if (m > 12) {
    m = 1;
    y += 1;
  }
  if (y !== saisonAnnee) return null;
  return { mois: m, annee: y };
}

/**
 * Impute un versement sur les créances (copie) selon l'ordre métier.
 * Si le montant dépasse les créances dues, crée des mensualités futures jusqu'à épuisement
 * ou fin de saison.
 *
 * @returns {{
 *   creances: object[],
 *   nouvellesCreances: object[],
 *   imputations: { creanceId: string, montant: number }[],
 *   montantImpute: number,
 *   soldeNonImpute: number,
 * }}
 */
export function imputerVersement({
  montant,
  creances = [],
  asOfDate = new Date(),
  adherentId,
  saisonId,
  saisonAnnee,
  tarifMensuel,
  idOf = (c) => c.id || c._tempId,
}) {
  let remaining = roundMoney(montant);
  if (remaining <= 0) {
    return {
      creances: creances.map((c) => ({ ...c })),
      nouvellesCreances: [],
      imputations: [],
      montantImpute: 0,
      soldeNonImpute: 0,
    };
  }

  const working = creances.map((c) => ({ ...c }));
  const nouvellesCreances = [];
  const imputations = [];
  const asOf = parseAsOf(asOfDate);

  const applyTo = (creance) => {
    const reste = resteDu(creance);
    if (reste <= 0 || remaining <= 0) return;
    const part = roundMoney(Math.min(reste, remaining));
    creance.montantPaye = roundMoney((creance.montantPaye || 0) + part);
    creance.statut = computeCreanceStatus(creance, asOf);
    remaining = roundMoney(remaining - part);
    imputations.push({ creanceId: idOf(creance), montant: part });
  };

  // Pass 1 : créances existantes dans l'ordre
  for (const c of orderCreancesForImputation(working, asOf)) {
    applyTo(c);
    if (remaining <= 0) break;
  }

  // Pass 2 : mois futurs si surplus — à partir du mois suivant la dernière mensualité connue
  if (remaining > 0 && tarifMensuel > 0 && saisonAnnee != null) {
    const mensualites = working.filter((c) => c.type === CREANCE_TYPES.MENSUALITE);
    const existingKeys = new Set(mensualites.map((c) => ymKey(c.annee, c.mois)));

    let anchorAnnee = asOf.getFullYear() === saisonAnnee ? asOf.getFullYear() : saisonAnnee;
    let anchorMois = asOf.getFullYear() === saisonAnnee ? asOf.getMonth() + 1 : 0;

    for (const c of mensualites) {
      if (Number(c.annee) !== Number(saisonAnnee)) continue;
      const key = ymKey(c.annee, c.mois);
      if (key > ymKey(anchorAnnee, anchorMois)) {
        anchorAnnee = Number(c.annee);
        anchorMois = Number(c.mois);
      }
    }

    let next =
      anchorMois === 0
        ? { mois: 1, annee: saisonAnnee }
        : nextSeasonMonth(anchorAnnee, anchorMois, saisonAnnee);

    let guard = 0;
    while (remaining > 0 && next && guard < 24) {
      guard += 1;
      const key = ymKey(next.annee, next.mois);
      if (!existingKeys.has(key)) {
        const future = buildFutureMensualite({
          adherentId,
          saisonId,
          mois: next.mois,
          annee: next.annee,
          tarifMensuel,
        });
        applyTo(future);
        working.push(future);
        nouvellesCreances.push(future);
        existingKeys.add(key);
      } else {
        const existing = working.find(
          (c) =>
            c.type === CREANCE_TYPES.MENSUALITE &&
            Number(c.mois) === next.mois &&
            Number(c.annee) === next.annee,
        );
        if (existing) applyTo(existing);
      }
      next = nextSeasonMonth(next.annee, next.mois, saisonAnnee);
    }
  }

  // Recalculer statuts
  for (const c of working) {
    c.statut = computeCreanceStatus(c, asOf);
  }

  const montantImpute = roundMoney((Number(montant) || 0) - remaining);
  return {
    creances: working,
    nouvellesCreances,
    imputations,
    montantImpute,
    soldeNonImpute: remaining,
  };
}

/**
 * Calcule le montant d'un paiement groupé multi-mois.
 * Croise tarif de base, palier général applicable, et dérogation adhérent ;
 * retient le montant le plus favorable (le plus bas) pour l'adhérent.
 *
 * @param {object} params
 * @param {number} params.nbMois
 * @param {number} params.tarifBase — tarif mensuel unitaire
 * @param {{ nbMoisMin: number, reductionPct: number }[]} params.paliersGeneraux
 * @param {{ nbMoisMin?: number, reductionPct: number }|null} params.reductionAdherent
 */
export function calculerPaiementGroupe({
  nbMois,
  tarifBase,
  paliersGeneraux = [],
  reductionAdherent = null,
}) {
  const n = Math.max(0, Math.floor(Number(nbMois) || 0));
  const unit = roundMoney(tarifBase);
  const brut = roundMoney(unit * n);

  const applyPct = (pct) => roundMoney(brut * (1 - (Number(pct) || 0) / 100));

  const candidats = [{ source: 'base', montant: brut, reductionPct: 0 }];

  const paliersEligibles = (paliersGeneraux || [])
    .filter((p) => n >= Number(p.nbMoisMin || 0))
    .sort((a, b) => Number(b.nbMoisMin) - Number(a.nbMoisMin));

  if (paliersEligibles.length > 0) {
    const best = paliersEligibles[0];
    candidats.push({
      source: 'palier_general',
      montant: applyPct(best.reductionPct),
      reductionPct: Number(best.reductionPct) || 0,
      palier: best,
    });
  }

  if (reductionAdherent && (reductionAdherent.nbMoisMin == null || n >= Number(reductionAdherent.nbMoisMin))) {
    candidats.push({
      source: 'derogation_adherent',
      montant: applyPct(reductionAdherent.reductionPct),
      reductionPct: Number(reductionAdherent.reductionPct) || 0,
    });
  }

  candidats.sort((a, b) => a.montant - b.montant);
  const choisi = candidats[0];

  return {
    nbMois: n,
    tarifUnitaire: unit,
    montantBrut: brut,
    montantFinal: choisi.montant,
    economie: roundMoney(brut - choisi.montant),
    sourceAppliquee: choisi.source,
    reductionPctAppliquee: choisi.reductionPct,
    candidats,
  };
}

/**
 * Créances dues jusqu'au mois courant (inscription + assurance + mensualités ≤ asOf).
 */
export function creancesDuesJusqua(creances, asOfDate = new Date()) {
  const asOf = parseAsOf(asOfDate);
  const currentYm = ymKey(asOf.getFullYear(), asOf.getMonth() + 1);
  return (creances || []).filter((c) => {
    if (c.type === CREANCE_TYPES.INSCRIPTION || c.type === CREANCE_TYPES.ASSURANCE) return true;
    if (c.type === CREANCE_TYPES.MENSUALITE) {
      return ymKey(c.annee, c.mois) <= currentYm;
    }
    return false;
  });
}

/**
 * Résumé portefeuille : total dû (saison → mois courant), total versé, solde restant.
 */
export function getResumePortefeuille({ creances = [], versements = [], asOfDate = new Date() }) {
  const dues = creancesDuesJusqua(creances, asOfDate);
  const totalDu = roundMoney(dues.reduce((s, c) => s + (c.montantDu || 0), 0));
  const totalVerse = roundMoney(versements.reduce((s, v) => s + (v.montant || 0), 0));
  const totalPayeSurCreances = roundMoney(
    (creances || []).reduce((s, c) => s + (c.montantPaye || 0), 0),
  );
  const soldeRestant = roundMoney(totalDu - totalVerse);

  return {
    totalDu,
    totalVerse,
    soldeRestant,
    totalPayeSurCreances,
    creditPortefeuille: roundMoney(Math.max(0, totalVerse - totalPayeSurCreances)),
  };
}

/**
 * Détail mois par mois (du mois d'inscription à la fin de saison, ou au moins jusqu'au mois courant).
 */
export function getDetailMensuel({
  creances = [],
  dateInscription,
  saisonAnnee,
  asOfDate = new Date(),
}) {
  const asOf = parseAsOf(asOfDate);
  const start = inscriptionStart(dateInscription, saisonAnnee);
  const seasonEnd = new Date(saisonAnnee, 11, 1);
  const end = startOfMonth(asOf) > seasonEnd ? seasonEnd : startOfMonth(asOf);

  // Inclure aussi les mois futurs déjà créés / payés d'avance
  const futurePaid = (creances || [])
    .filter((c) => c.type === CREANCE_TYPES.MENSUALITE)
    .map((c) => ({ mois: c.mois, annee: c.annee }));

  const baseMonths = monthsFromTo(start, end).filter((m) => m.annee === saisonAnnee);
  const monthMap = new Map(baseMonths.map((m) => [ymKey(m.annee, m.mois), m]));
  for (const m of futurePaid) {
    if (Number(m.annee) !== Number(saisonAnnee)) continue;
    const key = ymKey(m.annee, m.mois);
    if (!monthMap.has(key)) monthMap.set(key, m);
  }

  const months = Array.from(monthMap.values()).sort(
    (a, b) => ymKey(a.annee, a.mois) - ymKey(b.annee, b.mois),
  );

  return months.map(({ mois, annee }) => {
    const creance = (creances || []).find(
      (c) =>
        c.type === CREANCE_TYPES.MENSUALITE &&
        Number(c.mois) === Number(mois) &&
        Number(c.annee) === Number(annee),
    );
    const statut = creance
      ? computeCreanceStatus(creance, asOf)
      : CREANCE_STATUS.NON_PAYE;

    return {
      mois,
      annee,
      label: getMonthLabel(mois, annee),
      statut,
      montantDu: creance?.montantDu || 0,
      montantPaye: creance?.montantPaye || 0,
      reste: creance ? resteDu(creance) : 0,
      creanceId: creance?.id || null,
    };
  });
}

export function getStatusLabel(statut) {
  switch (statut) {
    case CREANCE_STATUS.PAYE:
      return 'Payé';
    case CREANCE_STATUS.PARTIEL:
      return 'Partiel';
    case CREANCE_STATUS.NON_PAYE:
      return 'Non payé';
    case CREANCE_STATUS.PAYE_AVANCE:
      return "Payé d'avance";
    default:
      return 'Inconnu';
  }
}
