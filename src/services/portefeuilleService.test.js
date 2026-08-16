/**
 * Tests unitaires — portefeuilleService
 * Couvre : imputation partielle, avance sur mois futurs, dérogation adhérent, génération au changement de mois.
 */

const {
  CREANCE_TYPES,
  CREANCE_STATUS,
  genererCreancesMois,
  imputerVersement,
  calculerPaiementGroupe,
  getResumePortefeuille,
  getDetailMensuel,
  computeCreanceStatus,
  resteDu,
} = require('./portefeuilleService');

describe('genererCreancesMois', () => {
  const base = {
    adherentId: 'adh-1',
    saisonId: 'saison-2026',
    saisonAnnee: 2026,
    dateInscription: '2026-01-15',
    fraisInscription: 2000,
    fraisAssurance: 500,
    tarifMensuel: 1500,
    assure: true,
    existingCreances: [],
  };

  test('génère inscription + assurance + mensualités jusqu’au mois courant uniquement', () => {
    const asOf = new Date(2026, 2, 10); // 10 mars 2026
    const nouvelles = genererCreancesMois({ ...base, asOfDate: asOf });

    expect(nouvelles.filter((c) => c.type === CREANCE_TYPES.INSCRIPTION)).toHaveLength(1);
    expect(nouvelles.filter((c) => c.type === CREANCE_TYPES.ASSURANCE)).toHaveLength(1);

    const mois = nouvelles
      .filter((c) => c.type === CREANCE_TYPES.MENSUALITE)
      .map((c) => c.mois)
      .sort((a, b) => a - b);

    expect(mois).toEqual([1, 2, 3]);
    expect(mois).not.toContain(4);
  });

  test('au changement de mois, crée uniquement la nouvelle mensualité manquante', () => {
    const existing = genererCreancesMois({
      ...base,
      asOfDate: new Date(2026, 1, 15), // février
    });

    const apresMars = genererCreancesMois({
      ...base,
      asOfDate: new Date(2026, 2, 1), // mars
      existingCreances: existing,
    });

    expect(apresMars).toHaveLength(1);
    expect(apresMars[0].type).toBe(CREANCE_TYPES.MENSUALITE);
    expect(apresMars[0].mois).toBe(3);
    expect(apresMars[0].annee).toBe(2026);
  });

  test('ne pré-génère pas toute la saison', () => {
    const nouvelles = genererCreancesMois({
      ...base,
      asOfDate: new Date(2026, 0, 20), // janvier
    });
    const mens = nouvelles.filter((c) => c.type === CREANCE_TYPES.MENSUALITE);
    expect(mens).toHaveLength(1);
    expect(mens[0].mois).toBe(1);
  });

  test('sans assurance, pas de créance assurance', () => {
    const nouvelles = genererCreancesMois({
      ...base,
      assure: false,
      asOfDate: new Date(2026, 0, 20),
    });
    expect(nouvelles.some((c) => c.type === CREANCE_TYPES.ASSURANCE)).toBe(false);
  });
});

describe('imputerVersement', () => {
  const asOf = new Date(2026, 2, 15); // mars

  function makeCreances() {
    return [
      {
        id: 'c-insc',
        type: CREANCE_TYPES.INSCRIPTION,
        montantDu: 2000,
        montantPaye: 0,
        statut: CREANCE_STATUS.NON_PAYE,
      },
      {
        id: 'c-ass',
        type: CREANCE_TYPES.ASSURANCE,
        montantDu: 500,
        montantPaye: 0,
        statut: CREANCE_STATUS.NON_PAYE,
      },
      {
        id: 'c-01',
        type: CREANCE_TYPES.MENSUALITE,
        mois: 1,
        annee: 2026,
        montantDu: 1500,
        montantPaye: 0,
        statut: CREANCE_STATUS.NON_PAYE,
      },
      {
        id: 'c-02',
        type: CREANCE_TYPES.MENSUALITE,
        mois: 2,
        annee: 2026,
        montantDu: 1500,
        montantPaye: 0,
        statut: CREANCE_STATUS.NON_PAYE,
      },
      {
        id: 'c-03',
        type: CREANCE_TYPES.MENSUALITE,
        mois: 3,
        annee: 2026,
        montantDu: 1500,
        montantPaye: 0,
        statut: CREANCE_STATUS.NON_PAYE,
      },
    ];
  }

  test('imputation partielle sur une créance', () => {
    const creances = makeCreances();
    const result = imputerVersement({
      montant: 800,
      creances,
      asOfDate: asOf,
      adherentId: 'adh-1',
      saisonId: 'saison-2026',
      saisonAnnee: 2026,
      tarifMensuel: 1500,
    });

    const insc = result.creances.find((c) => c.id === 'c-insc');
    expect(insc.montantPaye).toBe(800);
    expect(insc.statut).toBe(CREANCE_STATUS.PARTIEL);
    expect(resteDu(insc)).toBe(1200);
    expect(result.imputations).toEqual([{ creanceId: 'c-insc', montant: 800 }]);
    expect(result.soldeNonImpute).toBe(0);
    expect(result.nouvellesCreances).toHaveLength(0);

    // Les autres créances restent intactes
    expect(result.creances.find((c) => c.id === 'c-01').montantPaye).toBe(0);
  });

  test('ordre : inscription puis assurance puis mensualités du plus ancien au plus récent', () => {
    const result = imputerVersement({
      montant: 2000 + 500 + 1500 + 700, // insc + ass + jan + partiel fév
      creances: makeCreances(),
      asOfDate: asOf,
      adherentId: 'adh-1',
      saisonId: 'saison-2026',
      saisonAnnee: 2026,
      tarifMensuel: 1500,
    });

    expect(result.creances.find((c) => c.id === 'c-insc').statut).toBe(CREANCE_STATUS.PAYE);
    expect(result.creances.find((c) => c.id === 'c-ass').statut).toBe(CREANCE_STATUS.PAYE);
    expect(result.creances.find((c) => c.id === 'c-01').statut).toBe(CREANCE_STATUS.PAYE);

    const fev = result.creances.find((c) => c.id === 'c-02');
    expect(fev.montantPaye).toBe(700);
    expect(fev.statut).toBe(CREANCE_STATUS.PARTIEL);

    expect(result.creances.find((c) => c.id === 'c-03').montantPaye).toBe(0);
  });

  test('imputation dépassant vers des mois futurs', () => {
    // Tout le dû jusqu'à mars (2000+500+3*1500 = 7000) + 2 mois d'avance
    const du = 2000 + 500 + 1500 * 3;
    const result = imputerVersement({
      montant: du + 1500 * 2 + 300, // + avril, mai, partiel juin
      creances: makeCreances(),
      asOfDate: asOf,
      adherentId: 'adh-1',
      saisonId: 'saison-2026',
      saisonAnnee: 2026,
      tarifMensuel: 1500,
    });

    expect(result.nouvellesCreances.length).toBeGreaterThanOrEqual(2);

    const avril = result.creances.find((c) => c.mois === 4 && c.annee === 2026);
    const mai = result.creances.find((c) => c.mois === 5 && c.annee === 2026);
    const juin = result.creances.find((c) => c.mois === 6 && c.annee === 2026);

    expect(avril).toBeTruthy();
    expect(mai).toBeTruthy();
    expect(avril.statut).toBe(CREANCE_STATUS.PAYE_AVANCE);
    expect(mai.statut).toBe(CREANCE_STATUS.PAYE_AVANCE);
    expect(juin.montantPaye).toBe(300);
    expect(juin.statut).toBe(CREANCE_STATUS.PARTIEL);
    expect(result.soldeNonImpute).toBe(0);
  });
});

describe('calculerPaiementGroupe', () => {
  const paliers = [
    { nbMoisMin: 3, reductionPct: 10 },
    { nbMoisMin: 6, reductionPct: 20 },
  ];

  test('applique le palier général le plus élevé éligible', () => {
    const r = calculerPaiementGroupe({
      nbMois: 6,
      tarifBase: 1500,
      paliersGeneraux: paliers,
      reductionAdherent: null,
    });
    expect(r.montantBrut).toBe(9000);
    expect(r.montantFinal).toBe(7200); // -20%
    expect(r.sourceAppliquee).toBe('palier_general');
  });

  test('retient la dérogation adhérent si plus favorable', () => {
    const r = calculerPaiementGroupe({
      nbMois: 3,
      tarifBase: 1500,
      paliersGeneraux: paliers,
      reductionAdherent: { nbMoisMin: 1, reductionPct: 25 },
    });
    // base 4500, palier 10% → 4050, dérogation 25% → 3375
    expect(r.montantFinal).toBe(3375);
    expect(r.sourceAppliquee).toBe('derogation_adherent');
  });

  test('retient le palier général si plus favorable que la dérogation', () => {
    const r = calculerPaiementGroupe({
      nbMois: 6,
      tarifBase: 1500,
      paliersGeneraux: paliers,
      reductionAdherent: { reductionPct: 5 },
    });
    expect(r.montantFinal).toBe(7200);
    expect(r.sourceAppliquee).toBe('palier_general');
  });
});

describe('getResumePortefeuille & getDetailMensuel', () => {
  test('résumé : total dû jusqu’au mois courant, versé, solde', () => {
    const creances = [
      { type: CREANCE_TYPES.INSCRIPTION, montantDu: 2000, montantPaye: 2000 },
      { type: CREANCE_TYPES.MENSUALITE, mois: 1, annee: 2026, montantDu: 1500, montantPaye: 1500 },
      { type: CREANCE_TYPES.MENSUALITE, mois: 2, annee: 2026, montantDu: 1500, montantPaye: 500 },
      { type: CREANCE_TYPES.MENSUALITE, mois: 4, annee: 2026, montantDu: 1500, montantPaye: 1500 }, // avance
    ];
    const versements = [{ montant: 4000 }, { montant: 1500 }];
    const resume = getResumePortefeuille({
      creances,
      versements,
      asOfDate: new Date(2026, 1, 20), // février → dues = insc+jan+fév (pas avril)
    });

    expect(resume.totalDu).toBe(2000 + 1500 + 1500);
    expect(resume.totalVerse).toBe(5500);
    expect(resume.soldeRestant).toBe(5000 - 5500);
  });

  test('détail mensuel expose les statuts payé / partiel / non payé / payé d’avance', () => {
    const creances = [
      {
        id: 'm1',
        type: CREANCE_TYPES.MENSUALITE,
        mois: 1,
        annee: 2026,
        montantDu: 1500,
        montantPaye: 1500,
      },
      {
        id: 'm2',
        type: CREANCE_TYPES.MENSUALITE,
        mois: 2,
        annee: 2026,
        montantDu: 1500,
        montantPaye: 400,
      },
      {
        id: 'm4',
        type: CREANCE_TYPES.MENSUALITE,
        mois: 4,
        annee: 2026,
        montantDu: 1500,
        montantPaye: 1500,
      },
    ];

    const detail = getDetailMensuel({
      creances,
      dateInscription: '2026-01-10',
      saisonAnnee: 2026,
      asOfDate: new Date(2026, 2, 5), // mars
    });

    const byMois = Object.fromEntries(detail.map((d) => [d.mois, d]));
    expect(byMois[1].statut).toBe(CREANCE_STATUS.PAYE);
    expect(byMois[2].statut).toBe(CREANCE_STATUS.PARTIEL);
    expect(byMois[3].statut).toBe(CREANCE_STATUS.NON_PAYE);
    expect(byMois[4].statut).toBe(CREANCE_STATUS.PAYE_AVANCE);
  });
});

describe('computeCreanceStatus', () => {
  test('partiel si paiement incomplet', () => {
    expect(
      computeCreanceStatus({ montantDu: 1000, montantPaye: 200 }, new Date(2026, 0, 1)),
    ).toBe(CREANCE_STATUS.PARTIEL);
  });
});
