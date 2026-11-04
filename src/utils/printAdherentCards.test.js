// src/utils/printAdherentCards.test.js

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Image: { resolveAssetSource: jest.fn(() => ({ uri: 'mock-logo-uri' })) },
}));

jest.mock('../services/printing', () => ({
  printHtml: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { readFile: jest.fn() },
}));

import { Alert } from 'react-native';
import RNFS from 'react-native-fs';
import { printHtml } from '../services/printing';
import { printAllAdherentCards } from './printAdherentCards';

describe('printAdherentCards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('alerts if adherents list is empty', async () => {
    await printAllAdherentCards({ adherents: [] });
    expect(Alert.alert).toHaveBeenCalledWith('Information', 'Aucun adhérent à imprimer.');
    expect(printHtml).not.toHaveBeenCalled();
  });

  it('generates HTML cards and calls the native print API for given adherents', async () => {
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

    expect(printHtml).toHaveBeenCalledTimes(1);
    const html = printHtml.mock.calls[0][0];
    expect(html).toContain('BKAR100101');
    expect(html).toContain('Karim Benali');
    expect(html).toContain('SAMI120503');
    expect(html).toContain('Amina Saidi');
    expect(html).toContain('2025-2026');
    expect(html).toContain('KickBoxing');
    expect(html).toContain('Natation');
    expect(html).toContain('O+');
  });

  it('embeds the member photo in the printed card HTML', async () => {
    const photo = 'data:image/png;base64,cG5n';

    await printAllAdherentCards({
      adherents: [{
        id: '1',
        nom: 'Benali',
        prenom: 'Karim',
        dateNaissance: '2010-01-01',
        photo,
      }],
    });

    const html = printHtml.mock.calls[0][0];
    expect(html).toContain(`<img src="${photo}" class="photo-img" />`);
  });

  it('prints all cards when an old cached photo is no longer available', async () => {
    RNFS.readFile.mockRejectedValueOnce(new Error('ENOENT: file not found'));

    await printAllAdherentCards({
      adherents: [{
        id: '1',
        nom: 'Benali',
        prenom: 'Karim',
        code: 'BKAR100101',
        dateNaissance: '2010-01-01',
        photo: 'file:///data/user/0/com.cmbclub.app/cache/ImagePicker/photo.jpg',
      }],
    });

    expect(printHtml).toHaveBeenCalledTimes(1);
    expect(printHtml.mock.calls[0][0]).toContain('photo-placeholder');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Impression terminée avec des photos manquantes',
      expect.stringContaining('Toutes les cartes ont été imprimées'),
    );
  });
});
