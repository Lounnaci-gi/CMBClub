import { countOverdueAdherents, isPaymentOverdue } from './payments';

describe('payment overdue calculation', () => {
  const asOfDate = new Date(2026, 9, 28, 12);

  it('counts each adherent once when an overdue payment is unpaid or partially paid', () => {
    const paiements = [
      { adherentId: 'adherent-1', type: 'mensualite', mois: 9, annee: 2026, montantDu: 1500, montantPaye: 0 },
      { adherentId: 'adherent-1', type: 'mensualite', mois: 8, annee: 2026, montantDu: 1500, montantPaye: 500 },
      { adherentId: 'adherent-2', type: 'mensualite', mois: 9, annee: 2026, montantDu: 1500, montantPaye: 500 },
      { adherentId: 'adherent-3', type: 'mensualite', mois: 9, annee: 2026, montantDu: 1500, montantPaye: 1500 },
      { adherentId: 'adherent-4', type: 'mensualite', mois: 11, annee: 2026, montantDu: 1500, montantPaye: 0 },
    ];

    expect(countOverdueAdherents(paiements, asOfDate)).toBe(2);
  });

  it('uses the 30-day deadline for unpaid registration fees', () => {
    expect(isPaymentOverdue({
      adherentId: 'late-registration',
      type: 'inscription',
      montantDu: 2000,
      montantPaye: 0,
      createdAt: '2026-09-01T10:00:00',
    }, asOfDate)).toBe(true);

    expect(isPaymentOverdue({
      adherentId: 'recent-registration',
      type: 'inscription',
      montantDu: 2000,
      montantPaye: 0,
      createdAt: '2026-10-10T10:00:00',
    }, asOfDate)).toBe(false);
  });
});
