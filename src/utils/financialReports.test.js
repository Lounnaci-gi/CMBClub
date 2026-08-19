// src/utils/financialReports.test.js

jest.mock('expo-print', () => ({
  printAsync: jest.fn().mockResolvedValue(true),
}));

import {
  getWeekBounds,
  getWeeklyFinancialReport,
  getMonthlyFinancialReport,
  getSeasonFinancialReport,
} from './financialReports';

describe('financialReports utils', () => {
  describe('getWeekBounds', () => {
    it('returns Monday and Sunday for a given date', () => {
      // Wednesday 19 August 2026
      const wednesday = new Date(2026, 7, 19);
      const bounds = getWeekBounds(wednesday);

      expect(bounds.start.getDay()).toBe(1); // Monday
      expect(bounds.end.getDay()).toBe(0); // Sunday
      expect(bounds.start.getDate()).toBe(17); // 17 Aug
      expect(bounds.end.getDate()).toBe(23); // 23 Aug
    });
  });

  describe('getWeeklyFinancialReport', () => {
    const mockPaiements = [
      { id: '1', type: 'inscription', montantDu: 2000, montantPaye: 2000, datePaiement: '2026-08-18T10:00:00Z', statut: 'paye', discipline: 'KickBoxing' },
      { id: '2', type: 'mensualite', montantDu: 1500, montantPaye: 1500, datePaiement: '2026-08-19T14:00:00Z', statut: 'paye', discipline: 'Natation' },
      { id: '3', type: 'mensualite', montantDu: 1500, montantPaye: 0, statut: 'en_retard', discipline: 'Natation' },
      { id: '4', type: 'mensualite', montantDu: 1500, montantPaye: 1500, datePaiement: '2026-07-10T10:00:00Z', statut: 'paye', discipline: 'KickBoxing' }, // Outside week
    ];

    it('aggregates payments within the current week', () => {
      const refDate = new Date(2026, 7, 19); // 19 Aug 2026
      const report = getWeeklyFinancialReport(mockPaiements, refDate);

      expect(report.totalEncaisse).toBe(3500); // 2000 + 1500
      expect(report.nbEncaissements).toBe(2);
      expect(report.encaissementsInscription).toBe(2000);
      expect(report.encaissementsMensualites).toBe(1500);
      expect(report.totalRetards).toBe(1500);
      expect(report.parDiscipline['KickBoxing'].encaisse).toBe(2000);
      expect(report.parDiscipline['Natation'].encaisse).toBe(1500);
    });

    it('supports custom date interval between 2 specific dates', () => {
      const customPaiements = [
        { id: '1', type: 'inscription', montantDu: 2000, montantPaye: 2000, datePaiement: '2026-08-08T10:00:00Z', statut: 'paye', discipline: 'KickBoxing' },
        { id: '2', type: 'mensualite', montantDu: 1500, montantPaye: 1500, datePaiement: '2026-08-15T14:00:00Z', statut: 'paye', discipline: 'Natation' },
        { id: '3', type: 'mensualite', montantDu: 1500, montantPaye: 1500, datePaiement: '2026-08-19T09:00:00Z', statut: 'paye', discipline: 'Natation' },
        { id: '4', type: 'mensualite', montantDu: 1500, montantPaye: 1500, datePaiement: '2026-08-01T10:00:00Z', statut: 'paye', discipline: 'KickBoxing' }, // Before 08/08
        { id: '5', type: 'mensualite', montantDu: 1500, montantPaye: 1500, datePaiement: '2026-08-25T10:00:00Z', statut: 'paye', discipline: 'KickBoxing' }, // After 19/08
      ];

      const report = getWeeklyFinancialReport(customPaiements, '2026-08-08', '2026-08-19');

      expect(report.totalEncaisse).toBe(5000); // 2000 + 1500 + 1500
      expect(report.nbEncaissements).toBe(3);
      expect(report.periodLabel).toBe('Période du 08/08/2026 au 19/08/2026');
      expect(report.parDiscipline['KickBoxing'].encaisse).toBe(2000);
      expect(report.parDiscipline['Natation'].encaisse).toBe(3000);
    });
  });

  describe('getMonthlyFinancialReport', () => {
    const mockPaiements = [
      { id: '1', type: 'inscription', montantDu: 2000, montantPaye: 2000, datePaiement: '2026-08-10T00:00:00Z', statut: 'paye', discipline: 'Natation' },
      { id: '2', type: 'mensualite', mois: 8, annee: 2026, montantDu: 1500, montantPaye: 1500, statut: 'paye', discipline: 'Natation' },
      { id: '3', type: 'mensualite', mois: 8, annee: 2026, montantDu: 1500, montantPaye: 500, statut: 'avance', discipline: 'KickBoxing' },
      { id: '4', type: 'mensualite', mois: 8, annee: 2026, montantDu: 1500, montantPaye: 0, statut: 'en_retard', discipline: 'KickBoxing' },
      { id: '5', type: 'mensualite', mois: 9, annee: 2026, montantDu: 1500, montantPaye: 0, statut: 'a_payer', discipline: 'Natation' }, // September
    ];

    it('calculates monthly totals and recovery rate accurately', () => {
      const report = getMonthlyFinancialReport(mockPaiements, 8, 2026);

      expect(report.totalDuGlobal).toBe(6500); // 2000 insc + 3*1500
      expect(report.totalEncaisseGlobal).toBe(4000); // 2000 + 1500 + 500
      expect(report.totalResteGlobal).toBe(2500);
      expect(report.tauxRecouvrement).toBe(62); // 4000/6500 = 61.5% -> 62%
      expect(report.nbPayes).toBe(1);
      expect(report.nbPartiels).toBe(1);
      expect(report.nbEnRetard).toBe(1);
    });
  });

  describe('getSeasonFinancialReport', () => {
    const mockPaiements = [
      { id: '1', type: 'inscription', montantDu: 2000, montantPaye: 2000, statut: 'paye', discipline: 'Natation' },
      { id: '2', type: 'mensualite', mois: 1, annee: 2026, montantDu: 1500, montantPaye: 1500, statut: 'paye', discipline: 'Natation' },
      { id: '3', type: 'mensualite', mois: 2, annee: 2026, montantDu: 1500, montantPaye: 500, statut: 'avance', discipline: 'KickBoxing' },
      { id: '4', type: 'mensualite', mois: 3, annee: 2026, montantDu: 1500, montantPaye: 0, statut: 'en_retard', discipline: 'KickBoxing' },
    ];

    it('summarizes full season finances and debt', () => {
      const saison = { id: 's1', label: '2025-2026', annee: 2026 };
      const report = getSeasonFinancialReport(mockPaiements, saison);

      expect(report.totalDu).toBe(6500);
      expect(report.totalEncaisse).toBe(4000);
      expect(report.totalDettes).toBe(2500);
      expect(report.totalAvances).toBe(500);
      expect(report.totalRetards).toBe(1500);
      expect(report.tauxRecouvrement).toBe(62);
    });
  });
});
