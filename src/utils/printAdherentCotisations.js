// src/utils/printAdherentCotisations.js
import { Image, Alert } from 'react-native';
import * as Print from 'expo-print';
import { getEffectiveCategory } from './categories';
import { calculateAge } from './categories';
import { formatDate } from './seasons';

/**
 * Génère et imprime l'état des cotisations et mensualités d'un adhérent
 * pour la saison active avec tableau détaillé et totaux (Dû, Payé, Avancé, Reste).
 *
 * @param {object} params
 * @param {object} params.adherent
 * @param {object} params.saison
 * @param {Array} params.paiements
 * @param {object} [params.config]
 */
export async function printAdherentCotisations({ adherent, saison, paiements = [], config = {} }) {
  if (!adherent) {
    Alert.alert('Erreur', 'Adhérent non spécifié.');
    return;
  }

  try {
    let logoUri = '';
    try {
      logoUri = Image.resolveAssetSource(require('../../assets/cmbclub.png')).uri;
    } catch (_e) {
      logoUri = '';
    }

    const cat = getEffectiveCategory(adherent);
    const age = calculateAge(adherent.dateNaissance);
    const now = new Date();
    const currentDateStr = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentYm = currentYear * 100 + currentMonth;

    // Trier les cotisations : Inscription d'abord, Assurance, puis mensualités chronologiques
    const sortedPaiements = [...paiements].sort((a, b) => {
      if (a.type === 'inscription') return -1;
      if (b.type === 'inscription') return 1;
      if (a.type === 'assurance') return -1;
      if (b.type === 'assurance') return 1;
      const ya = Number(a.annee) || 0;
      const yb = Number(b.annee) || 0;
      if (ya !== yb) return ya - yb;
      const ma = Number(a.mois) || 0;
      const mb = Number(b.mois) || 0;
      return ma - mb;
    });

    let totalDu = 0;
    let totalPaye = 0;
    let totalAvance = 0;
    let totalReste = 0;

    const rowsHtml = sortedPaiements.map((p, index) => {
      const montantDu = Number(p.montantDu) || 0;
      const montantPaye = Number(p.montantPaye) || 0;
      const remiseMontant = Number(p.remiseMontant) || 0;
      const netDu = Math.max(0, montantDu - remiseMontant);
      const reste = Math.max(0, netDu - montantPaye);

      // Déterminer si c'est un mois futur
      const isFutureMonth = p.type === 'mensualite' && p.annee && p.mois && (Number(p.annee) * 100 + Number(p.mois) > currentYm);

      // Calcul de la part avancée
      let avance = 0;
      if (isFutureMonth && montantPaye > 0) {
        avance = montantPaye;
      } else if (montantPaye > netDu) {
        avance = montantPaye - netDu;
      }

      totalDu += netDu;
      totalPaye += montantPaye;
      totalAvance += avance;
      totalReste += reste;

      // Détermination de la mention et couleur
      let mention = 'Non payé';
      let mentionColor = '#DC2626'; // Rouge
      let mentionBg = '#FEF2F2';
      let mentionBorder = '#FCA5A5';

      if (montantPaye >= netDu && netDu > 0) {
        if (isFutureMonth) {
          mention = "Payé d'avance";
          mentionColor = '#2563EB'; // Bleu
          mentionBg = '#EFF6FF';
          mentionBorder = '#93C5FD';
        } else {
          mention = 'Payé';
          mentionColor = '#059669'; // Vert
          mentionBg = '#ECFDF5';
          mentionBorder = '#6EE7B7';
        }
      } else if (montantPaye > 0) {
        mention = `Partiel (${montantPaye.toLocaleString()} DA)`;
        mentionColor = '#D97706'; // Ambre/Jaune
        mentionBg = '#FFFBEB';
        mentionBorder = '#FCD34D';
      }

      let dateReglement = '-';
      if (p.datePaiement) {
        try {
          dateReglement = new Date(p.datePaiement).toLocaleDateString('fr-FR');
        } catch (_e) {
          dateReglement = p.datePaiement;
        }
      }

      return `
        <tr style="${index % 2 === 1 ? 'background-color: #F8FAFC;' : 'background-color: #FFFFFF;'}">
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; text-align: center; color: #64748B; font-size: 11px;">
            ${index + 1}
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #0F172A;">
            ${p.label || p.type || 'Cotisation'}
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 600; color: #0F172A;">
            ${netDu.toLocaleString()} DA
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 700; color: #059669;">
            ${montantPaye.toLocaleString()} DA
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 600; color: ${avance > 0 ? '#2563EB' : '#94A3B8'};">
            ${avance > 0 ? `${avance.toLocaleString()} DA` : '-'}
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 700; color: ${reste > 0 ? '#DC2626' : '#94A3B8'};">
            ${reste > 0 ? `${reste.toLocaleString()} DA` : '0 DA'}
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; text-align: center;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 14px; font-size: 10px; font-weight: 700; background-color: ${mentionBg}; color: ${mentionColor}; border: 1px solid ${mentionBorder};">
              ${mention}
            </span>
          </td>
          <td style="padding: 9px 10px; border-bottom: 1px solid #E2E8F0; text-align: center; color: #64748B; font-size: 11px;">
            ${dateReglement}
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>État des cotisations - ${adherent.prenom} ${adherent.nom}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm;
            }
            body {
              font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
              color: #0F172A;
              margin: 0;
              padding: 0;
              font-size: 12px;
              line-height: 1.4;
            }
            .header-table {
              width: 100%;
              border-bottom: 2px solid #0F172A;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            .logo-cell {
              width: 65px;
              vertical-align: middle;
            }
            .logo-img {
              width: 54px;
              height: 54px;
              border-radius: 27px;
            }
            .title-cell {
              vertical-align: middle;
            }
            .title-cell h1 {
              margin: 0;
              font-size: 20px;
              font-weight: 800;
              color: #0F172A;
              letter-spacing: -0.5px;
            }
            .title-cell p {
              margin: 2px 0 0 0;
              font-size: 12px;
              color: #475569;
              font-weight: 600;
            }
            .meta-cell {
              text-align: right;
              vertical-align: middle;
              font-size: 11px;
              color: #64748B;
            }
            .meta-cell strong {
              color: #0F172A;
            }

            .info-card {
              background-color: #F8FAFC;
              border: 1px solid #E2E8F0;
              border-radius: 10px;
              padding: 12px 16px;
              margin-bottom: 16px;
            }
            .info-grid {
              width: 100%;
              border-collapse: collapse;
            }
            .info-grid td {
              padding: 4px 8px;
              font-size: 12px;
            }
            .info-label {
              color: #64748B;
              font-weight: 600;
              width: 18%;
            }
            .info-value {
              color: #0F172A;
              font-weight: 700;
              width: 32%;
            }
            .code-badge {
              font-family: monospace;
              background-color: #E2E8F0;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 11px;
            }

            .table-container {
              width: 100%;
              margin-top: 10px;
              margin-bottom: 16px;
            }
            table.cotisations {
              width: 100%;
              border-collapse: collapse;
            }
            table.cotisations th {
              background-color: #0F172A;
              color: #FFFFFF;
              padding: 9px 10px;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              border: 1px solid #0F172A;
            }
            table.cotisations td {
              font-size: 11.5px;
            }

            .totals-card {
              margin-top: 16px;
              border: 2px solid #0F172A;
              border-radius: 8px;
              overflow: hidden;
              background-color: #F8FAFC;
            }
            .totals-header {
              background-color: #0F172A;
              color: #FFFFFF;
              padding: 8px 12px;
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .totals-table {
              width: 100%;
              border-collapse: collapse;
            }
            .totals-table td {
              padding: 12px;
              text-align: center;
              border-right: 1px solid #E2E8F0;
            }
            .totals-table td:last-child {
              border-right: none;
            }
            .tot-label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748B;
              margin-bottom: 4px;
            }
            .tot-val {
              font-size: 17px;
              font-weight: 800;
            }

            .signatures-box {
              margin-top: 30px;
              display: flex;
              justify-content: space-between;
              width: 100%;
            }
            .sig-block {
              width: 45%;
              border-top: 1px dashed #94A3B8;
              padding-top: 8px;
              text-align: center;
              font-size: 11px;
              font-weight: 600;
              color: #475569;
            }

            .footer-note {
              margin-top: 35px;
              text-align: center;
              font-size: 10px;
              color: #94A3B8;
              border-top: 1px solid #E2E8F0;
              padding-top: 8px;
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              ${logoUri ? `<td class="logo-cell"><img src="${logoUri}" class="logo-img" /></td>` : ''}
              <td class="title-cell">
                <h1>CMB CLUB · ÉTAT DES COTISATIONS</h1>
                <p>Saison Sportive : <strong>${saison?.label || saison?.annee || 'En cours'}</strong></p>
              </td>
              <td class="meta-cell">
                Document édité le :<br/>
                <strong>${currentDateStr}</strong>
              </td>
            </tr>
          </table>

          <div class="info-card">
            <table class="info-grid">
              <tr>
                <td class="info-label">Adhérent :</td>
                <td class="info-value">${adherent.prenom} ${adherent.nom?.toUpperCase()}</td>
                <td class="info-label">Code Adhérent :</td>
                <td class="info-value"><span class="code-badge">${adherent.code || '-'}</span></td>
              </tr>
              <tr>
                <td class="info-label">Discipline :</td>
                <td class="info-value">${adherent.discipline || '-'}</td>
                <td class="info-label">Catégorie :</td>
                <td class="info-value">${cat.icon || '🏅'} ${cat.label} ${age ? `(${age} ans)` : ''}</td>
              </tr>
              <tr>
                <td class="info-label">Date Naissance :</td>
                <td class="info-value">${formatDate(adherent.dateNaissance)}</td>
                <td class="info-label">Assurance :</td>
                <td class="info-value" style="color: ${adherent.assure ? '#059669' : '#DC2626'};">
                  ${adherent.assure ? '🛡️ Assuré' : '❌ Non assuré'}
                </td>
              </tr>
            </table>
          </div>

          <div class="table-container">
            <table class="cotisations">
              <thead>
                <tr>
                  <th style="width: 5%; text-align: center;">#</th>
                  <th style="width: 27%; text-align: left;">Désignation / Échéance</th>
                  <th style="width: 12%; text-align: right;">Montant Dû</th>
                  <th style="width: 12%; text-align: right;">Montant Payé</th>
                  <th style="width: 12%; text-align: right;">Avancé</th>
                  <th style="width: 12%; text-align: right;">Reste</th>
                  <th style="width: 12%; text-align: center;">Mention</th>
                  <th style="width: 8%; text-align: center;">Date Règl.</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="8" style="text-align: center; padding: 16px; color: #64748B;">Aucune cotisation enregistrée</td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="totals-card">
            <div class="totals-header">RÉCAPITULATIF FINANCIER DE LA SAISON</div>
            <table class="totals-table">
              <tr>
                <td style="background-color: #F1F5F9;">
                  <div class="tot-label">Total Dû</div>
                  <div class="tot-val" style="color: #0F172A;">${totalDu.toLocaleString()} DA</div>
                </td>
                <td style="background-color: #ECFDF5;">
                  <div class="tot-label" style="color: #059669;">Total Payé</div>
                  <div class="tot-val" style="color: #059669;">${totalPaye.toLocaleString()} DA</div>
                </td>
                <td style="background-color: #EFF6FF;">
                  <div class="tot-label" style="color: #2563EB;">Total Avancé</div>
                  <div class="tot-val" style="color: #2563EB;">${totalAvance.toLocaleString()} DA</div>
                </td>
                <td style="background-color: ${totalReste > 0 ? '#FEF2F2' : '#F8FAFC'};">
                  <div class="tot-label" style="color: ${totalReste > 0 ? '#DC2626' : '#64748B'};">Total Reste</div>
                  <div class="tot-val" style="color: ${totalReste > 0 ? '#DC2626' : '#059669'};">
                    ${totalReste.toLocaleString()} DA
                  </div>
                </td>
              </tr>
            </table>
          </div>

          <div class="signatures-box" style="margin-top: 35px; display: table; width: 100%;">
            <div style="display: table-cell; width: 45%; vertical-align: top;">
              <div class="sig-block">
                Signature de l'adhérent / Tuteur légal
                <div style="height: 45px;"></div>
              </div>
            </div>
            <div style="display: table-cell; width: 10%;"></div>
            <div style="display: table-cell; width: 45%; vertical-align: top;">
              <div class="sig-block">
                Cachet et Signature de la Direction du Club
                <div style="height: 45px;"></div>
              </div>
            </div>
          </div>

          <div class="footer-note">
            CMB Club Management System · Document certifié conforme généré automatiquement
          </div>
        </body>
      </html>
    `;

    await Print.printAsync({ html });
  } catch (error) {
    console.error('Erreur lors de l’impression:', error);
    Alert.alert('Erreur', 'Impossible de lancer l’impression : ' + (error.message || 'Erreur inconnue'));
  }
}
