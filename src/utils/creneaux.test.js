// src/utils/creneaux.test.js
import {
  getTodayJour,
  parseTimeToMinutes,
  getSlotStatus,
  findActiveOrUpcomingSlotToday,
  isLateBy20Min,
  getSlotStartDateTime,
  getDateForJour,
} from './creneaux';

describe('creneaux utils', () => {
  describe('parseTimeToMinutes', () => {
    it('correctly converts HH:MM to minutes', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
      expect(parseTimeToMinutes('09:30')).toBe(570);
      expect(parseTimeToMinutes('17:00')).toBe(1020);
      expect(parseTimeToMinutes('18:45')).toBe(1125);
      expect(parseTimeToMinutes('23:59')).toBe(1439);
    });

    it('handles irregular and invalid strings safely', () => {
      expect(parseTimeToMinutes('')).toBeNull();
      expect(parseTimeToMinutes(null)).toBeNull();
      expect(parseTimeToMinutes('invalid')).toBeNull();
      expect(parseTimeToMinutes(' 18:00 ')).toBe(1080);
    });
  });

  describe('getSlotStatus', () => {
    const tuesdaySlot = {
      id: 'c1',
      jour: 'Mardi',
      heureDebut: '17:00',
      heureFin: '18:30',
    };

    it('returns not_today if day does not match', () => {
      // Monday date: 2026-08-17 is Monday
      const mondayDate = new Date(2026, 7, 17, 17, 30);
      expect(getSlotStatus(tuesdaySlot, mondayDate)).toBe('not_today');
    });

    it('returns upcoming before start time on the same day', () => {
      // Tuesday date: 2026-08-18 at 15:00
      const tuesdayBefore = new Date(2026, 7, 18, 15, 0);
      expect(getSlotStatus(tuesdaySlot, tuesdayBefore)).toBe('upcoming');
    });

    it('returns ongoing during the slot window on the same day', () => {
      // Tuesday date: 2026-08-18 at 17:30
      const tuesdayDuring = new Date(2026, 7, 18, 17, 30);
      expect(getSlotStatus(tuesdaySlot, tuesdayDuring)).toBe('ongoing');
    });

    it('returns ended after end time on the same day', () => {
      // Tuesday date: 2026-08-18 at 19:00
      const tuesdayAfter = new Date(2026, 7, 18, 19, 0);
      expect(getSlotStatus(tuesdaySlot, tuesdayAfter)).toBe('ended');
    });
  });

  describe('findActiveOrUpcomingSlotToday', () => {
    const sampleCreneaux = [
      { id: 'c1', jour: 'Mardi', heureDebut: '09:00', heureFin: '10:30', discipline: 'Natation' },
      { id: 'c2', jour: 'Mardi', heureDebut: '17:00', heureFin: '18:30', discipline: 'KickBoxing' },
      { id: 'c3', jour: 'Mardi', heureDebut: '19:00', heureFin: '20:30', discipline: 'KickBoxing' },
      { id: 'c4', jour: 'Mercredi', heureDebut: '14:00', heureFin: '16:00', discipline: 'Natation' },
    ];

    it('returns ongoing slot when current time is within slot window', () => {
      // Tuesday at 17:15
      const now = new Date(2026, 7, 18, 17, 15);
      const res = findActiveOrUpcomingSlotToday(sampleCreneaux, now);
      expect(res.status).toBe('ongoing');
      expect(res.reason).toBe('found');
      expect(res.slot.id).toBe('c2');
    });

    it('returns next upcoming slot when no slot is ongoing but upcoming slots exist', () => {
      // Tuesday at 11:00 (c1 ended at 10:30, c2 starts at 17:00)
      const now = new Date(2026, 7, 18, 11, 0);
      const res = findActiveOrUpcomingSlotToday(sampleCreneaux, now);
      expect(res.status).toBe('upcoming');
      expect(res.reason).toBe('found');
      expect(res.slot.id).toBe('c2');
    });

    it('returns all_slots_ended when all slots for today are finished', () => {
      // Tuesday at 21:00
      const now = new Date(2026, 7, 18, 21, 0);
      const res = findActiveOrUpcomingSlotToday(sampleCreneaux, now);
      expect(res.slot).toBeNull();
      expect(res.status).toBe('ended');
      expect(res.reason).toBe('all_slots_ended');
      expect(res.todaySlots).toHaveLength(3);
    });

    it('returns no_slots_today when no slots exist for today', () => {
      // Sunday: 2026-08-16
      const now = new Date(2026, 7, 16, 10, 0);
      const res = findActiveOrUpcomingSlotToday(sampleCreneaux, now);
      expect(res.slot).toBeNull();
      expect(res.status).toBe('no_slots');
      expect(res.reason).toBe('no_slots_today');
      expect(res.todaySlots).toHaveLength(0);
    });
  });

  describe('isLateBy20Min', () => {
    it('detects late arrivals past 20 minutes', () => {
      // Slot at 17:00
      const onTime = new Date(2026, 7, 18, 17, 15); // +15 min
      const late = new Date(2026, 7, 18, 17, 25);   // +25 min
      expect(isLateBy20Min('17:00', onTime)).toBe(false);
      expect(isLateBy20Min('17:00', late)).toBe(true);
    });
  });
});
