import { describe, expect, it } from 'vitest';
import { hasDstTransition, hoursBetween, indexOfNow, leadHoursFrom } from './time';

describe('hoursBetween', () => {
  it('compte 24h sur une journee ordinaire', () => {
    expect(hoursBetween('2026-08-17T00:00', '2026-08-18T00:00')).toBe(24);
  });

  it("compte 23h en traversant le passage a l'heure d'ete (dernier dimanche de mars)", () => {
    expect(hoursBetween('2026-03-29T00:00', '2026-03-30T00:00')).toBe(23);
  });

  it("compte 25h en traversant le passage a l'heure d'hiver (dernier dimanche d'octobre)", () => {
    expect(hoursBetween('2026-10-25T00:00', '2026-10-26T00:00')).toBe(25);
  });

  it('leve une erreur sur un format invalide', () => {
    expect(() => hoursBetween('17/08/2026', '2026-08-18T00:00')).toThrow(
      "Format d'instant local invalide",
    );
  });
});

describe('leadHoursFrom', () => {
  it('est positive pour un point futur', () => {
    expect(leadHoursFrom(new Date('2026-08-17T10:00:00+02:00'), '2026-08-17T14:00')).toBe(4);
  });

  it('est negative pour un point passe', () => {
    expect(leadHoursFrom(new Date('2026-08-17T10:00:00+02:00'), '2026-08-17T08:00')).toBe(-2);
  });

  it('est nulle quand le point correspond exactement a now', () => {
    expect(leadHoursFrom(new Date('2026-08-17T10:00:00+02:00'), '2026-08-17T10:00')).toBe(0);
  });
});

describe('indexOfNow', () => {
  const timeline = ['2026-08-17T10:00', '2026-08-17T11:00', '2026-08-17T12:00'];

  it('retourne -1 si tous les points sont passes', () => {
    expect(indexOfNow(timeline, new Date('2026-08-18T00:00:00+02:00'))).toBe(-1);
  });

  it("retourne l'index du point egal a now", () => {
    expect(indexOfNow(timeline, new Date('2026-08-17T11:00:00+02:00'))).toBe(1);
  });

  it('retourne 0 si now precede tous les points', () => {
    expect(indexOfNow(timeline, new Date('2026-08-17T00:00:00+02:00'))).toBe(0);
  });
});

describe('hasDstTransition', () => {
  it('est vrai sur une serie de mars traversant le changement', () => {
    const timeline = [
      '2026-03-28T22:00',
      '2026-03-28T23:00',
      '2026-03-29T00:00',
      '2026-03-29T01:00',
      '2026-03-29T03:00',
    ];
    expect(hasDstTransition(timeline)).toBe(true);
  });

  it("est faux sur une serie d'aout", () => {
    const timeline = ['2026-08-17T10:00', '2026-08-17T11:00', '2026-08-17T12:00'];
    expect(hasDstTransition(timeline)).toBe(false);
  });

  it('est faux sur une timeline vide', () => {
    expect(hasDstTransition([])).toBe(false);
  });
});
