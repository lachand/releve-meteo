import { describe, expect, it } from 'vitest';
import { WAVE_FORMS, waveForm, waveOutlook } from './marine';
import type { MarineHourly } from './marine';

// 10 h 12 locales le 28 septembre 2026.
const NOW = new Date('2026-09-28T08:12:00Z');
const timeline = Array.from(
  { length: 8 },
  (_, i) => `2026-09-28T${String(8 + i).padStart(2, '0')}:00`,
) as MarineHourly['timeline'];

function series(overrides: Partial<MarineHourly> = {}): MarineHourly {
  return {
    timeline,
    waveHeight: [0.5, 0.6, 0.8, 1.4, 2.1, 1.8, 1.0, 0.7],
    wavePeriod: [6, 6, 7, 8, 9, 8, 7, 6],
    waveDirection: [270, 270, 280, 290, 300, 300, 290, 280],
    ...overrides,
  };
}

describe('waveOutlook', () => {
  it('donne l heure courante et le pic des prochaines heures, avec sa periode', () => {
    const outlook = waveOutlook({ series: series(), now: NOW, hours: 24 });
    expect(outlook?.current).toEqual({
      time: '2026-09-28T10:00',
      height: 0.8,
      period: 7,
      direction: 280,
    });
    expect(outlook?.peak).toEqual({ time: '2026-09-28T12:00', height: 2.1, period: 9 });
    expect(outlook?.hours.map((h) => h.time)).toHaveLength(6);
  });

  it('ne compte pas une hauteur absente comme une mer plate', () => {
    const outlook = waveOutlook({
      series: series({ waveHeight: [null, null, null, null, null, null, null, null] }),
      now: NOW,
    });
    expect(outlook).toBeNull();
    const partial = waveOutlook({
      series: series({ waveHeight: [0.5, 0.6, null, 1.4, 0.9, 0.8, 1.0, 0.7] }),
      now: NOW,
    });
    expect(partial?.current).toBeNull();
    expect(partial?.peak?.height).toBe(1.4);
  });

  it('respecte la fenetre, et laisse periode et direction a null quand elles manquent', () => {
    const outlook = waveOutlook({
      series: series({ wavePeriod: [], waveDirection: [] }),
      now: NOW,
      hours: 1,
    });
    expect(outlook?.hours).toHaveLength(2);
    expect(outlook?.current).toMatchObject({ period: null, direction: null });
    expect(outlook?.peak).toMatchObject({ period: null });
  });

  it('se tait sans heure a venir', () => {
    expect(waveOutlook({ series: series({ timeline: [] }), now: NOW })).toBeNull();
  });
});

describe('waveForm', () => {
  it('nomme l etat de la mer selon l echelle de Douglas, par la hauteur', () => {
    expect(WAVE_FORMS.length).toBeGreaterThan(5);
    expect(waveForm(0.05)).toBe('calme');
    expect(waveForm(0.3)).toBe('ridée');
    expect(waveForm(0.8)).toBe('belle');
    expect(waveForm(1.8)).toBe('agitée');
    expect(waveForm(3)).toBe('forte');
    expect(waveForm(5)).toBe('très forte');
    expect(waveForm(7)).toBe('grosse');
    expect(waveForm(12)).toBe('énorme');
  });
});
