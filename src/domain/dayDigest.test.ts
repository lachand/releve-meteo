import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import type { AlertPoint } from './alerts';
import { DIGEST_HOURS, dayDigest } from './dayDigest';

// Lundi 28 septembre 2026, 10 h 12 locales.
const NOW = new Date('2026-09-28T08:12:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 72);

function points(
  hour: (index: number) => {
    temperature?: number | null;
    rain?: number | null;
    gust?: number | null;
  },
): AlertPoint[] {
  return TIMELINE.map((time, index) => {
    const over = hour(index);
    return {
      ...hourlyPoint(time, {
        temperature: 'temperature' in over ? (over.temperature ?? null) : 15,
        precipitation: 'rain' in over ? (over.rain ?? null) : 0,
        windGust: 'gust' in over ? (over.gust ?? null) : 20,
      }),
      model: 'arome' as const,
    };
  });
}

describe('dayDigest', () => {
  it('resume les 24 heures a venir : extremes de temperature, cumul de pluie, rafale maximale', () => {
    const digest = dayDigest({
      points: points((i) => ({
        temperature: 10 + (i % 24),
        rain: i === 12 || i === 13 ? 0.6 : 0,
        gust: i === 20 ? 62 : 25,
      })),
      now: NOW,
    });
    // Heures 10 (a partir de l'heure courante) a 34 : temperatures 10..23 puis 0..10.
    expect(digest).toEqual({
      tempMin: 10,
      tempMax: 33,
      rainMm: 1.2,
      gustMax: 62,
    });
  });

  it('ignore ce qui depasse la fenetre de 24 h ou precede l heure courante', () => {
    const digest = dayDigest({
      points: points((i) => ({
        rain: i < 9 || i > 10 + DIGEST_HOURS ? 50 : 0,
        gust: i < 9 || i > 10 + DIGEST_HOURS ? 120 : 20,
      })),
      now: NOW,
    });
    expect(digest?.rainMm).toBe(0);
    expect(digest?.gustMax).toBe(20);
  });

  it('dit null, jamais 0, pour une grandeur sans aucune valeur', () => {
    const digest = dayDigest({
      points: points(() => ({ temperature: null, rain: null, gust: null })),
      now: NOW,
    });
    expect(digest).toEqual({ tempMin: null, tempMax: null, rainMm: null, gustMax: null });
  });

  it('ne rend rien sans point a venir', () => {
    expect(dayDigest({ points: [], now: NOW })).toBeNull();
  });
});
