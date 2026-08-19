// src/utils/financialReports.js
// Module de calcul et d'impression des bilans financiers (Hebdomadaire, Mensuel, Saison Complète)
import * as Print from 'expo-print';
import { formatDate } from './seasons';
import { PAYMENT_STATUS } from './payments';

/**
 * Retourne les bornes de la semaine (Lundi 00:00 au Dimanche 23:59) pour une date donnée
 */
export function getWeekBounds(dateRef = new Date()) {
  const d = new Date(dateRef);
  const day = d.getDay();
  // Lundi = 1, Dimanche = 7
  const diffToMonday = d.getDate() - (day === 0 ? 6 : day - 1);
  const monday = new Date(d.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * Calcule le bilan financier sur un intervalle personnalisé entre 2 dates
 */
export function getIntervalFinancialReport(paiements = [], startDate, endDate) {
  let startIso, endIso;

  if (startDate instanceof Date) {
    startIso = startDate.toISOString().slice(0, 10);
  } else if (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startDate)) {
    startIso = startDate.slice(0, 10);
  } else {
    const { start } = getWeekBounds();
    startIso = start.toISOString().slice(0, 10);
  }

  if (endDate instanceof Date) {
    endIso = endDate.toISOString().slice(0, 10);
  } else if (typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(endDate)) {
    endIso = endDate.slice(0, 10);
  } else {
    const { end } = getWeekBounds();
    endIso = end.toISOString().slice(0, 10);
  }

  // Si la date de début est postérieure à la date de fin, réordonner
  if (startIso > endIso) {
    const tmp = startIso;
    startIso = endIso;
    endIso = tmp;
  }

  // Paiements enregistrés durant cet intervalle (datePaiement comprise entre start et end)
  const paiementsInterval = paiements.filter(p => {
    if (!p.datePaiement) return false;
    const dp = p.datePaiement.slice(0, 10);
    return dp >= startIso && dp <= endIso;
  });

  const totalEncaisse = paiementsInterval.reduce((sum, p) => sum + (p.montantPaye || 0), 0);
  const totalDu = paiementsInterval.reduce((sum, p) => sum + (p.montantDu || 0), 0);
  const totalReste = Math.max(0, totalDu - totalEncaisse);
  const nbEncaissements = paiementsInterval.length;

  const encaissementsInscription = paiementsInterval
    .filter(p => p.type === 'inscription')
    .reduce((sum, p) => sum + (p.montantPaye || 0), 0);

  const encaissementsMensualites = paiementsInterval
    .filter(p => p.type === 'mensualite')
    .reduce((sum, p) => sum + (p.montantPaye || 0), 0);

  // Retards actuels dans la base
  const retardsActuels = paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD);
  const totalRetards = retardsActuels.reduce((sum, p) => sum + Math.max(0, (p.montantDu || 0) - (p.montantPaye || 0)), 0);

  // Répartition par discipline
  const parDiscipline = {};
  paiementsInterval.forEach(p => {
    const disc = p.discipline || 'Non assigné';
    if (!parDiscipline[disc]) {
      parDiscipline[disc] = { du: 0, encaisse: 0, reste: 0, nbLignes: 0 };
    }
    parDiscipline[disc].du += (p.montantDu || 0);
    parDiscipline[disc].encaisse += (p.montantPaye || 0);
    parDiscipline[disc].reste += Math.max(0, (p.montantDu || 0) - (p.montantPaye || 0));
    parDiscipline[disc].nbLignes++;
  });

  const tauxRecouvrement = totalDu > 0 ? Math.round((totalEncaisse / totalDu) * 100) : (totalEncaisse > 0 ? 100 : 0);

  return {
    type: 'hebdomadaire',
    periodLabel: `Période du ${formatDate(startIso)} au ${formatDate(endIso)}`,
    startDate: startIso,
    endDate: endIso,
    totalDuGlobal: totalDu,
    totalEncaisseGlobal: totalEncaisse,
    totalResteGlobal: totalReste,
    totalEncaisse,
    nbEncaissements,
    encaissementsInscription,
    encaissementsMensualites,
    totalRetards,
    nbRetards: retardsActuels.length,
    tauxRecouvrement,
    parDiscipline,
    paiementsSemaine: paiementsInterval,
    paiementsInterval,
  };
}

/**
 * Calcule le bilan financier hebdomadaire ou par intervalle
 */
export function getWeeklyFinancialReport(paiements = [], startOrDateRef = new Date(), maybeEnd = null) {
  if (maybeEnd || (typeof startOrDateRef === 'string' && /^\d{4}-\d{2}-\d{2}/.test(startOrDateRef))) {
    return getIntervalFinancialReport(paiements, startOrDateRef, maybeEnd);
  }
  const { start, end } = getWeekBounds(startOrDateRef);
  return getIntervalFinancialReport(paiements, start, end);
}

/**
 * Calcule le bilan financier mensuel pour un mois et une année donnés
 */
export function getMonthlyFinancialReport(paiements = [], mois = new Date().getMonth() + 1, annee = new Date().getFullYear()) {
  const moisNum = Number(mois);
  const anneeNum = Number(annee);

  // Mensualités cibles de ce mois
  const mensualitesDuMois = paiements.filter(p =>
    p.type === 'mensualite' && Number(p.mois) === moisNum && Number(p.annee) === anneeNum
  );

  // Frais d'inscription encaissés ou créés durant ce mois
  const inscriptionsDuMois = paiements.filter(p => {
    if (p.type !== 'inscription') return false;
    const d = p.datePaiement || p.createdAt;
    if (!d) return false;
    const dateObj = new Date(d);
    return dateObj.getMonth() + 1 === moisNum && dateObj.getFullYear() === anneeNum;
  });

  const totalDuMensualites = mensualitesDuMois.reduce((s, p) => s + (p.montantDu || 0), 0);
  const totalPayeMensualites = mensualitesDuMois.reduce((s, p) => s + (p.montantPaye || 0), 0);
  const totalResteMensualites = Math.max(0, totalDuMensualites - totalPayeMensualites);

  const totalDuInscriptions = inscriptionsDuMois.reduce((s, p) => s + (p.montantDu || 0), 0);
  const totalPayeInscriptions = inscriptionsDuMois.reduce((s, p) => s + (p.montantPaye || 0), 0);

  const totalDuGlobal = totalDuMensualites + totalDuInscriptions;
  const totalEncaisseGlobal = totalPayeMensualites + totalPayeInscriptions;
  const totalResteGlobal = Math.max(0, totalDuGlobal - totalEncaisseGlobal);

  const nbAdherentsCibles = mensualitesDuMois.length;
  const nbPayes = mensualitesDuMois.filter(p => p.statut === PAYMENT_STATUS.PAYE).length;
  const nbPartiels = mensualitesDuMois.filter(p => p.statut === PAYMENT_STATUS.AVANCE).length;
  const nbEnRetard = mensualitesDuMois.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD).length;
  const nbNonPayes = mensualitesDuMois.filter(p => p.statut === PAYMENT_STATUS.A_PAYER).length;

  const tauxRecouvrement = totalDuGlobal > 0
    ? Math.round((totalEncaisseGlobal / totalDuGlobal) * 100)
    : 0;

  // Répartition par discipline
  const parDiscipline = {};
  [...mensualitesDuMois, ...inscriptionsDuMois].forEach(p => {
    const disc = p.discipline || 'Non assigné';
    if (!parDiscipline[disc]) {
      parDiscipline[disc] = { du: 0, encaisse: 0, reste: 0 };
    }
    parDiscipline[disc].du += (p.montantDu || 0);
    parDiscipline[disc].encaisse += (p.montantPaye || 0);
    parDiscipline[disc].reste += Math.max(0, (p.montantDu || 0) - (p.montantPaye || 0));
  });

  const MOIS_NOMS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  const moisNom = MOIS_NOMS[moisNum - 1] || `Mois ${moisNum}`;

  return {
    type: 'mensuel',
    periodLabel: `${moisNom} ${anneeNum}`,
    mois: moisNum,
    annee: anneeNum,
    totalDuGlobal,
    totalEncaisseGlobal,
    totalResteGlobal,
    totalDuMensualites,
    totalPayeMensualites,
    totalResteMensualites,
    totalDuInscriptions,
    totalPayeInscriptions,
    tauxRecouvrement,
    nbAdherentsCibles,
    nbPayes,
    nbPartiels,
    nbEnRetard,
    nbNonPayes,
    parDiscipline,
    mensualitesDuMois,
  };
}

/**
 * Calcule le bilan financier complet de la saison
 */
export function getSeasonFinancialReport(paiements = [], saison = null) {
  const totalDu = paiements.reduce((s, p) => s + (p.montantDu || 0), 0);
  const totalEncaisse = paiements.reduce((s, p) => s + (p.montantPaye || 0), 0);
  const totalDettes = Math.max(0, totalDu - totalEncaisse);

  // Inscriptions
  const inscriptions = paiements.filter(p => p.type === 'inscription');
  const duInscriptions = inscriptions.reduce((s, p) => s + (p.montantDu || 0), 0);
  const payeInscriptions = inscriptions.reduce((s, p) => s + (p.montantPaye || 0), 0);

  // Mensualités
  const mensualites = paiements.filter(p => p.type === 'mensualite');
  const duMensualites = mensualites.reduce((s, p) => s + (p.montantDu || 0), 0);
  const payeMensualites = mensualites.reduce((s, p) => s + (p.montantPaye || 0), 0);

  // Avances
  const avances = paiements.filter(p => p.statut === PAYMENT_STATUS.AVANCE);
  const totalAvances = avances.reduce((s, p) => s + (p.montantPaye || 0), 0);

  // Retards
  const retards = paiements.filter(p => p.statut === PAYMENT_STATUS.EN_RETARD);
  const totalRetards = retards.reduce((s, p) => s + Math.max(0, (p.montantDu || 0) - (p.montantPaye || 0)), 0);

  const tauxRecouvrement = totalDu > 0 ? Math.round((totalEncaisse / totalDu) * 100) : 0;

  // Répartition par discipline
  const parDiscipline = {};
  paiements.forEach(p => {
    const disc = p.discipline || 'Non assigné';
    if (!parDiscipline[disc]) {
      parDiscipline[disc] = { du: 0, encaisse: 0, reste: 0, nbLignes: 0 };
    }
    parDiscipline[disc].du += (p.montantDu || 0);
    parDiscipline[disc].encaisse += (p.montantPaye || 0);
    parDiscipline[disc].reste += Math.max(0, (p.montantDu || 0) - (p.montantPaye || 0));
    parDiscipline[disc].nbLignes++;
  });

  return {
    type: 'saison',
    periodLabel: saison ? `Saison ${saison.label}` : 'Saison Complète',
    totalDu,
    totalEncaisse,
    totalDettes,
    duInscriptions,
    payeInscriptions,
    duMensualites,
    payeMensualites,
    totalAvances,
    nbAvances: avances.length,
    totalRetards,
    nbRetards: retards.length,
    tauxRecouvrement,
    nbTotalLignes: paiements.length,
    parDiscipline,
  };
}

/**
 * Génère et imprime le rapport financier PDF
 */
export async function printFinancialReport({ report, saison = null, clubName = 'CMB CLUB' }) {
  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const discRows = Object.entries(report.parDiscipline || {}).map(([disc, stats]) => {
    const du = typeof stats === 'number' ? stats : (stats.du || 0);
    const enc = typeof stats === 'number' ? stats : (stats.encaisse || 0);
    const reste = typeof stats === 'number' ? 0 : (stats.reste || 0);
    const taux = du > 0 ? Math.round((enc / du) * 100) : (enc > 0 ? 100 : 0);

    return `
      <tr style="border-bottom:1px solid #E2E8F0">
        <td style="padding:9px 12px;font-weight:700">${disc}</td>
        <td style="padding:9px 12px;text-align:right">${du.toLocaleString()} DA</td>
        <td style="padding:9px 12px;text-align:right;color:#16A34A;font-weight:700">${enc.toLocaleString()} DA</td>
        <td style="padding:9px 12px;text-align:right;color:#DC2626;font-weight:700">${reste.toLocaleString()} DA</td>
        <td style="padding:9px 12px;text-align:right;font-weight:700">${taux}%</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @page{size:A4 portrait;margin:12mm}
      body{font-family:Arial,sans-serif;font-size:12px;color:#0F172A;margin:0;padding:10px}
      .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284C7;padding-bottom:12px;margin-bottom:18px}
      h1{margin:0;font-size:22px;font-weight:900;color:#0F172A}
      .badge{display:inline-block;background:#0F172A;color:#38BDF8;font-weight:700;padding:4px 12px;border-radius:12px;font-size:12px}
      .kpi-grid{display:flex;gap:12px;margin-bottom:20px}
      .kpi-card{flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px;text-align:center}
      .kpi-val{font-size:18px;font-weight:900;margin-bottom:4px}
      .kpi-lbl{font-size:11px;color:#64748B;text-transform:uppercase;font-weight:600}
      table{width:100%;border-collapse:collapse;margin-top:10px;margin-bottom:20px}
      th{background:#0F172A;color:#fff;text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
      .footer{margin-top:30px;display:flex;justify-content:space-between;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:10px}
    </style></head><body>
    <div class="header">
      <div>
        <h1>📊 BILAN FINANCIER — ${report.periodLabel.toUpperCase()}</h1>
        <p style="margin:4px 0 0;color:#64748B">${clubName} · Club Omnisports</p>
      </div>
      <div style="text-align:right">
        <div class="badge">${saison ? `Saison ${saison.label}` : 'Finances'}</div>
        <div style="font-size:11px;color:#64748B;margin-top:4px">Édité le : ${now}</div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-val" style="color:#0284C7">${(report.totalDuGlobal ?? report.totalDu ?? 0).toLocaleString()} DA</div>
        <div class="kpi-lbl">Total Dû</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val" style="color:#16A34A">${(report.totalEncaisseGlobal ?? report.totalEncaisse ?? 0).toLocaleString()} DA</div>
        <div class="kpi-lbl">Total Encaissé</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val" style="color:#DC2626">${(report.totalResteGlobal ?? report.totalDettes ?? report.totalRetards ?? 0).toLocaleString()} DA</div>
        <div class="kpi-lbl">Reste Dû / Dettes</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val" style="color:#8B5CF6">${report.tauxRecouvrement ?? 0}%</div>
        <div class="kpi-lbl">Recouvrement</div>
      </div>
    </div>

    <!-- Détail par discipline -->
    <h3 style="margin-bottom:8px;font-size:14px">Répartition par Discipline</h3>
    <table>
      <thead><tr>
        <th>Discipline</th>
        <th style="text-align:right">Montant Dû</th>
        <th style="text-align:right">Encaissé</th>
        <th style="text-align:right">Reste / Retards</th>
        <th style="text-align:right">Taux</th>
      </tr></thead>
      <tbody>${discRows || '<tr><td colspan="5" style="text-align:center;padding:12px;color:#888">Aucune donnée</td></tr>'}</tbody>
    </table>

    <div class="footer">
      <div>CMBClub App · Gestion Financière & Cotisations</div>
      <div>Page 1 / 1</div>
    </div>
  </body></html>`;

  await Print.printAsync({ html });
}
