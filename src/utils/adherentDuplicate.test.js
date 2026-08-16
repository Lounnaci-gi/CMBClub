import {
  normalizeIdentityString,
  isSameAdherentIdentity,
  findAdherentDuplicate,
} from './adherentCode';

describe('Vérification des doublons d\'adhérents', () => {
  describe('normalizeIdentityString', () => {
    test('supprime les accents', () => {
      expect(normalizeIdentityString('Élodie')).toBe('elodie');
      expect(normalizeIdentityString('Hélène')).toBe('helene');
      expect(normalizeIdentityString('Céline')).toBe('celine');
    });

    test('met en minuscules et trim les espaces', () => {
      expect(normalizeIdentityString('  BEN ALI  ')).toBe('ben ali');
      expect(normalizeIdentityString('Mohamed   Amine')).toBe('mohamed amine');
    });

    test('gère les valeurs nulles ou indéfinies', () => {
      expect(normalizeIdentityString(null)).toBe('');
      expect(normalizeIdentityString(undefined)).toBe('');
      expect(normalizeIdentityString('')).toBe('');
    });
  });

  describe('isSameAdherentIdentity', () => {
    test('détecte deux adhérents identiques avec même nom, prénom et dateNaissance', () => {
      const a1 = { nom: 'Benali', prenom: 'Karim', dateNaissance: '2010-05-15' };
      const a2 = { nom: 'BENALI', prenom: 'karim', dateNaissance: '2010-05-15' };
      expect(isSameAdherentIdentity(a1, a2)).toBe(true);
    });

    test('détecte les doublons avec accents et espaces différents', () => {
      const a1 = { nom: 'Éléonore', prenom: '  Jean-Baptiste  ', dateNaissance: '2008-11-20' };
      const a2 = { nom: 'eleonore', prenom: 'Jean-Baptiste', dateNaissance: '2008-11-20' };
      expect(isSameAdherentIdentity(a1, a2)).toBe(true);
    });

    test('retourne false si la date de naissance est différente', () => {
      const a1 = { nom: 'Benali', prenom: 'Karim', dateNaissance: '2010-05-15' };
      const a2 = { nom: 'Benali', prenom: 'Karim', dateNaissance: '2010-05-16' };
      expect(isSameAdherentIdentity(a1, a2)).toBe(false);
    });

    test('retourne false si le nom ou prénom est différent', () => {
      const a1 = { nom: 'Benali', prenom: 'Karim', dateNaissance: '2010-05-15' };
      const a2 = { nom: 'Benali', prenom: 'Yacine', dateNaissance: '2010-05-15' };
      expect(isSameAdherentIdentity(a1, a2)).toBe(false);
    });

    test('retourne false si un champ clé est manquant', () => {
      expect(isSameAdherentIdentity({ nom: 'Benali', prenom: '' }, { nom: 'Benali', prenom: '' })).toBe(false);
    });
  });

  describe('findAdherentDuplicate', () => {
    const list = [
      { id: '1', code: 'BENKA1005', nom: 'Benali', prenom: 'Karim', dateNaissance: '2010-05-15' },
      { id: '2', code: 'SAIAM0902', nom: 'Saidi', prenom: 'Amine', dateNaissance: '2009-02-10' },
    ];

    test('trouve un adhérent existant dans la liste', () => {
      const target = { nom: 'benali', prenom: 'KARIM', dateNaissance: '2010-05-15' };
      const duplicate = findAdherentDuplicate(list, target);
      expect(duplicate).not.toBeNull();
      expect(duplicate.id).toBe('1');
      expect(duplicate.code).toBe('BENKA1005');
    });

    test('ne trouve pas de doublon si nouveau profil', () => {
      const target = { nom: 'Benali', prenom: 'Samir', dateNaissance: '2010-05-15' };
      expect(findAdherentDuplicate(list, target)).toBeNull();
    });

    test('exclut l\'adhérent lui-même lors d\'une modification (excludeId)', () => {
      const target = { id: '1', nom: 'Benali', prenom: 'Karim', dateNaissance: '2010-05-15' };
      expect(findAdherentDuplicate(list, target, '1')).toBeNull();
    });

    test('détecte un conflit lors de la modification vers les coordonnées d\'un autre adhérent', () => {
      const target = { id: '2', nom: 'Benali', prenom: 'Karim', dateNaissance: '2010-05-15' };
      const duplicate = findAdherentDuplicate(list, target, '2');
      expect(duplicate).not.toBeNull();
      expect(duplicate.id).toBe('1');
    });
  });
});
