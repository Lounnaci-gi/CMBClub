// src/utils/printPresencesSeance.test.js

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Image: { resolveAssetSource: jest.fn(() => ({ uri: '' })) },
}));

jest.mock('expo-print', () => ({
  printAsync: jest.fn(),
}));

import { parsePresenceDetails } from './printPresencesSeance';

describe('printPresencesSeance utils', () => {
  describe('parsePresenceDetails', () => {
    it('parses on-time presence with auto-generated text', () => {
      const res = parsePresenceDetails('present', 'Présent à 17:15');
      expect(res.time).toBe('17:15');
      expect(res.statutLabel).toBe('Présent');
      expect(res.statutColor).toBe('#16A34A');
    });

    it('parses late arrival with auto-generated text', () => {
      const res = parsePresenceDetails('retard', 'Retard (18:23 - >20 min créneau 17:00)');
      expect(res.time).toBe('18:23');
      expect(res.statutLabel).toBe('En retard');
      expect(res.statutColor).toBe('#D97706');
    });

    it('parses absence with auto-generated text', () => {
      const res = parsePresenceDetails('absent', 'Absent (18:23)');
      expect(res.time).toBe('18:23');
      expect(res.statutLabel).toBe('Absent');
      expect(res.statutColor).toBe('#DC2626');
    });

    it('parses QR scan arrivals properly', () => {
      const res = parsePresenceDetails('present', 'Présent à 17:08 (QR Scan)');
      expect(res.time).toBe('17:08');
      expect(res.statutLabel).toBe('Présent');
    });

    it('handles empty remarks safely', () => {
      const res = parsePresenceDetails('present', '');
      expect(res.time).toBe('-');
      expect(res.statutLabel).toBe('Présent');
    });
  });
});
