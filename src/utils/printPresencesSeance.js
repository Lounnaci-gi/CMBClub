// src/utils/printPresencesSeance.js
import { Image, Alert } from 'react-native';
import * as Print from 'expo-print';
import { getEffectiveCategory } from './categories';

/**
 * Extrait l'heure et formate le statut et la remarque de présence
 */
export function parsePresenceDetails(statut, remarque = '') {
  let time = '-';
  let cleanRemarque = (remarque || '').trim();

  // Détection "Présent à HH:MM"
  const presentMatch = cleanRemarque.match(/Présent à\s*(\d{1,2}:\d{2})/i);
  if (presentMatch) {
    time = presentMatch[1];
  }

  // Détection "Retard (HH:MM"
  const retardMatch = cleanRemarque.match(/Retard\s*\(\s*(\d{1,2}:\d{2})/i);
  if (retardMatch) {
    time = retardMatch[1];
  }

  // Détection "Absent (HH:MM"
  const absentMatch = cleanRemarque.match(/Absent\s*\(\s*(\d{1,2}:\d{2})/i);
  if (absentMatch) {
    time = absentMatch[1];
  }

  // Détection générique d'heure HH:MM si non trouvée
  if (time === '-') {
    const genericMatch = cleanRemarque.match(/\b(\d{1,2}:\d{2})\b/);
    if (genericMatch) {
      time = genericMatch[1];
    }
  }

  let statutLabel = 'Présent';
  let statutColor = '#16A34A'; // Vert
  let statutBg = '#DCFCE7';
  let statutBorder = '#86EFAC';

  if (!statut || statut === 'non_pointe') {
    statutLabel = 'Non pointé';
    statutColor = '#64748B';
    statutBg = '#F1F5F9';
    statutBorder = '#CBD5E1';
    time = '-';
  } else if (statut === 'retard') {
    statutLabel = 'En retard';
    statutColor = '#D97706'; // Ambre
    statutBg = '#FEF3C7';
    statutBorder = '#FCD34D';
  } else if (statut === 'absent') {
    statutLabel = 'Absent';
    statutColor = '#DC2626'; // Rouge
    statutBg = '#FEE2E2';
    statutBorder = '#FCA5A5';
  } else if (statut === 'excuse') {
    statutLabel = 'Excusé';
    statutColor = '#2563EB'; // Bleu
    statutBg = '#DBEAFE';
    statutBorder = '#93C5FD';
  }

  return {
    time,
    cleanRemarque,
    statutLabel,
    statutColor,
    statutBg,
    statutBorder,
  };
}

/**
 * Génère et imprime la feuille d'appel et de présence pour une séance donnée
 */
export async function printPresencesSeance({
  creneau,
  dateSeance,
  saison,
  adherents = [],
  presenceMap = {},
  config = {},
}) {
  if (!creneau) {
    Alert.alert('Erreur', 'Veuillez sélectionner un créneau à imprimer.');
    return;
  }

  try {
    let logoUri = '';
    try {
      logoUri = Image.resolveAssetSource(require('../../assets/cmbclub.png')).uri;
    } catch (_e) {
      logoUri = '';
    }

    const now = new Date();
    const currentDateStr = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Formater la date de la séance
    let formattedDateSeance = dateSeance;
    if (dateSeance && dateSeance.includes('-')) {
      const parts = dateSeance.split('-');
      if (parts.length === 3) {
        formattedDateSeance = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    // Calcul des statistiques de la séance
    let nbPresents = 0;
    let nbRetards = 0;
    let nbAbsents = 0;
    let nbExcuses = 0;

    adherents.forEach(a => {
      const p = presenceMap[a.id] || { statut: 'present' };
      if (p.statut === 'present') nbPresents++;
      else if (p.statut === 'retard') nbRetards++;
      else if (p.statut === 'absent') nbAbsents++;
      else if (p.statut === 'excuse') nbExcuses++;
    });

    const totalAdherents = adherents.length;
    const tauxPresence = totalAdherents > 0
      ? Math.round(((nbPresents + nbRetards) / totalAdherents) * 100)
      : 0;

    // Lignes du tableau
    const rowsHtml = adherents.map((adh, index) => {
      const p = presenceMap[adh.id] || { statut: 'present', remarque: '' };
      const details = parsePresenceDetails(p.statut, p.remarque);
      const catObj = getEffectiveCategory(adh);
      const catLabel = catObj?.label || adh.categorie || '-';

      const isEven = index % 2 === 0;
      const rowBg = isEven ? '#FFFFFF' : '#F8FAFC';

      return `
        <tr style="background-color: ${rowBg}; border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 6px; text-align: center; font-weight: 700; color: #64748B; font-size: 11px;">
            ${index + 1}
          </td>
          <td style="padding: 8px 6px; font-family: monospace; font-size: 11px; color: #334155; font-weight: 700;">
            ${adh.code || '-'}
          </td>
          <td style="padding: 8px 6px; font-weight: 700; color: #0F172A; font-size: 12px;">
            ${adh.nom ? adh.nom.toUpperCase() : ''} ${adh.prenom || ''}
          </td>
          <td style="padding: 8px 6px; font-size: 11px; color: #475569;">
            ${catLabel}
          </td>
          <td style="padding: 8px 6px; text-align: center;">
            <span style="
              display: inline-block;
              padding: 3px 8px;
              border-radius: 6px;
              font-size: 10.5px;
              font-weight: 800;
              color: ${details.statutColor};
              background-color: ${details.statutBg};
              border: 1px solid ${details.statutBorder};
            ">
              ${details.statutLabel}
            </span>
          </td>
          <td style="padding: 8px 6px; text-align: center; font-weight: 700; font-size: 11.5px; color: ${details.statut === 'retard' ? '#D97706' : details.statut === 'present' ? '#16A34A' : '#64748B'};">
            ${details.time !== '-' ? details.time : (details.statut === 'absent' ? '—' : creneau.heureDebut || '-')}
          </td>
          <td style="padding: 8px 6px; font-size: 10.5px; color: #64748B; font-style: italic;">
            ${details.cleanRemarque || '—'}
          </td>
          <td style="padding: 8px 6px; border-left: 1px dashed #CBD5E1; text-align: center; width: 60px;">
          </td>
        </tr>
      `;
    }).join('');

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Feuille d'Appel — ${creneau.discipline} (${formattedDateSeance})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      color: #0F172A;
      background: #FFF;
      margin: 0;
      padding: 0;
    }
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2.5px solid #0EA5E9;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .club-title {
      font-size: 20px;
      font-weight: 900;
      color: #0F172A;
      margin: 0 0 2px 0;
      letter-spacing: -0.3px;
    }
    .doc-subtitle {
      font-size: 13px;
      font-weight: 800;
      color: #0284C7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
    }
    .club-desc {
      font-size: 10.5px;
      color: #64748B;
      margin: 0;
    }
    .meta-box {
      text-align: right;
    }
    .saison-badge {
      display: inline-block;
      background: #0F172A;
      color: #38BDF8;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 4px;
    }
    .date-edition {
      font-size: 10px;
      color: #64748B;
    }

    /* Informations de la séance */
    .session-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .session-item {
      font-size: 11px;
    }
    .session-item b {
      color: #475569;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
    }
    .session-item span {
      color: #0F172A;
      font-weight: 800;
      margin-left: 4px;
    }

    /* Stats résumé */
    .stats-row {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }
    .stat-card {
      flex: 1;
      border-radius: 8px;
      padding: 8px 10px;
      text-align: center;
      border: 1px solid #E2E8F0;
    }
    .stat-card-val {
      font-size: 18px;
      font-weight: 900;
      line-height: 1.1;
    }
    .stat-card-lbl {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 3px;
      color: #64748B;
    }

    /* Tableau */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      margin-bottom: 16px;
    }
    thead th {
      background-color: #0F172A;
      color: #FFFFFF;
      text-align: left;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 6px;
    }
    tbody tr:hover {
      background-color: #F1F5F9 !important;
    }

    /* Signatures & Footer */
    .signature-section {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
      gap: 20px;
    }
    .sign-box {
      flex: 1;
      border: 1px dashed #94A3B8;
      border-radius: 6px;
      padding: 8px 12px;
      height: 75px;
      background: #FAFAFA;
    }
    .sign-title {
      font-size: 10px;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #E2E8F0;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #94A3B8;
    }
  </style>
</head>
<body>

  <!-- En-tête -->
  <div class="header-container">
    <div>
      <div class="doc-subtitle">Feuille d'Émargement & de Présence</div>
      <h1 class="club-title">CMB CLUB — ${creneau.discipline}</h1>
      <p class="club-desc">${config.nomClub || 'Club Omnisports CMB'} · Section Sportive & Arts Martiaux</p>
    </div>
    <div class="meta-box">
      <div class="saison-badge">Saison ${saison?.label || 'Active'}</div>
      <div class="date-edition">Édité le : ${currentDateStr}</div>
    </div>
  </div>

  <!-- Détails de la séance -->
  <div class="session-card">
    <div class="session-item">
      <b>Date Séance :</b>
      <span>${formattedDateSeance} (${creneau.jour})</span>
    </div>
    <div class="session-item">
      <b>Créneau :</b>
      <span>${creneau.heureDebut} — ${creneau.heureFin || ''}</span>
    </div>
    <div class="session-item">
      <b>Discipline :</b>
      <span>${creneau.discipline}</span>
    </div>
    <div class="session-item">
      <b>Catégorie(s) :</b>
      <span>${creneau.categorie || 'Toutes'}</span>
    </div>
    ${creneau.lieu ? `
    <div class="session-item">
      <b>Lieu :</b>
      <span>${creneau.lieu}</span>
    </div>
    ` : ''}
  </div>

  <!-- Résumé Statistique -->
  <div class="stats-row">
    <div class="stat-card" style="background: #F8FAFC;">
      <div class="stat-card-val" style="color: #0F172A;">${totalAdherents}</div>
      <div class="stat-card-lbl">Adhérents</div>
    </div>
    <div class="stat-card" style="background: #F0FDF4; border-color: #BBF7D0;">
      <div class="stat-card-val" style="color: #16A34A;">${nbPresents}</div>
      <div class="stat-card-lbl" style="color: #16A34A;">Présents</div>
    </div>
    <div class="stat-card" style="background: #FFFBEB; border-color: #FDE68A;">
      <div class="stat-card-val" style="color: #D97706;">${nbRetards}</div>
      <div class="stat-card-lbl" style="color: #D97706;">En Retard</div>
    </div>
    <div class="stat-card" style="background: #FEF2F2; border-color: #FECACA;">
      <div class="stat-card-val" style="color: #DC2626;">${nbAbsents}</div>
      <div class="stat-card-lbl" style="color: #DC2626;">Absents</div>
    </div>
    <div class="stat-card" style="background: #F0F9FF; border-color: #BAE6FD;">
      <div class="stat-card-val" style="color: #0284C7;">${tauxPresence}%</div>
      <div class="stat-card-lbl" style="color: #0284C7;">Assiduité</div>
    </div>
  </div>

  <!-- Tableau des présences -->
  <table>
    <thead>
      <tr>
        <th style="width: 25px; text-align: center;">#</th>
        <th style="width: 80px;">Code</th>
        <th>Nom & Prénom</th>
        <th style="width: 85px;">Catégorie</th>
        <th style="width: 80px; text-align: center;">Statut</th>
        <th style="width: 75px; text-align: center;">Heure Pointage</th>
        <th>Observations / Remarques</th>
        <th style="width: 60px; text-align: center;">Visa</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #94A3B8;">Aucun adhérent enregistré pour ce créneau.</td></tr>'}
    </tbody>
  </table>

  <!-- Cadres de signature -->
  <div class="signature-section">
    <div class="sign-box">
      <div class="sign-title">Observations de l'entraîneur</div>
    </div>
    <div class="sign-box" style="width: 220px; flex: none;">
      <div class="sign-title">Visa / Signature de l'entraîneur</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>CMBClub — Système de Gestion et Suivi d'Assiduité</div>
    <div>Document généré le ${currentDateStr}</div>
  </div>

</body>
</html>
    `;

    await Print.printAsync({ html });
  } catch (error) {
    Alert.alert("Erreur d'impression", error.message || "Impossible d'imprimer la feuille d'appel.");
  }
}
