// src/utils/printAdherentCards.test.js

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Image: { resolveAssetSource: jest.fn(() => ({ uri: 'mock-logo-uri' })) },
}));

jest.mock('expo-print', () => ({
  printAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

import * as Print from 'expo-print';
import { Alert } from 'react-native';
import { printAllAdherentCards } from './printAdherentCards';

describe('printAdherentCards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('alerts if adherents list is empty', async () => {
    await printAllAdherentCards({ adherents: [] });
    expect(Alert.alert).toHaveBeenCalledWith('Information', 'Aucun adhérent à imprimer.');
    expect(Print.printAsync).not.toHaveBeenCalled();
  });

  it('generates HTML cards and calls Print.printAsync for given adherents', async () => {
    const adherents = [
      {
        id: '1',
        nom: 'Benali',
        prenom: 'Karim',
        code: 'BKAR100101',
        dateNaissance: '2010-01-01',
        lieuNaissance: 'Alger',
        telephone: '0555001122',
        discipline: 'KickBoxing',
        genre: 'M',
        groupeSanguin: 'O+',
      },
      {
        id: '2',
        nom: 'Saidi',
        prenom: 'Amina',
        code: 'SAMI120503',
        dateNaissance: '2012-05-03',
        lieuNaissance: 'Oran',
        telephone: '0666334455',
        discipline: 'Natation',
        genre: 'F',
      },
    ];

    const saison = { id: 's-2025', label: '2025-2026', annee: 2025 };

    await printAllAdherentCards({ adherents, saison });

    expect(Print.printAsync).toHaveBeenCalledTimes(1);
    const callArgs = Print.printAsync.mock.calls[0][0];
    expect(callArgs.html).toContain('BKAR100101');
    expect(callArgs.html).toContain('Karim Benali');
    expect(callArgs.html).toContain('SAMI120503');
    expect(callArgs.html).toContain('Amina Saidi');
    expect(callArgs.html).toContain('2025-2026');
    expect(callArgs.html).toContain('KickBoxing');
    expect(callArgs.html).toContain('Natation');
    expect(callArgs.html).toContain('O+');
  });
});
