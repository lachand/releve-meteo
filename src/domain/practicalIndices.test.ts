import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import type { AlertPoint } from './alerts';
import { PRACTICAL_INDICES, practicalIndices } from './practicalIndices';
import type { LocalIsoHour, ModelId } from './types';

// Lundi 28 septembre 2026, 10 h 12 locales (8 h 12 UTC en heure d'ete).
const NOW = new Date('2026-09-28T08:12:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 48);

interface Hour {
  readonly temperature?: number | null;
  readonly rain?: number | null;
  readonly gust?: number | null;
  readonly wind?: number | null;
  readonly humidity?: number | null;
  readonly visibility?: number | null;
  readonly isDay?: boolean | null;
  readonly model?: ModelId;
}

/** Points du 28 et du 29 ; `hour(i)` surcharge l'heure i (defaut : doux, sec, calme, jour de 7 h a 19 h). */
function points(hour: (i: number) => Hour = () => ({})): AlertPoint[] {
  return TIMELINE.map((time, i) => {
    const h = i % 24;
    const over = hour(i);
    const pick = <K extends keyof Hour>(key: K, fallback: number | null) =>
      key in over ? ((over[key] as number | null | undefined) ?? null) : fallback;
    return {
      ...hourlyPoint(time as LocalIsoHour, {
        temperature: pick('temperature', 14),
        precipitation: pick('rain', 0),
        windGust: pick('gust', 20),
        windSpeed: pick('wind', 10),
        humidity: pick('humidity', 65),
        visibility: pick('visibility', 20000),
        isDay: 'isDay' in over ? (over.isDay ?? null) : h >= 7 && h < 20,
      }),
      model: over.model ?? 'arome',
    };
  });
}

function verdicts(result: ReturnType<typeof practicalIndices>) {
  return Object.fromEntries((result?.indices ?? []).map((index) => [index.id, index.verdict]));
}

describe('practicalIndices', () => {
  it('juge les heures de jour qui restent aujourd hui, et nomme le modele', () => {
    const result = practicalIndices({ points: points(), now: NOW });
    expect(result).toMatchObject({
      day: 'today',
      start: '2026-09-28T10:00',
      end: '2026-09-28T20:00',
      hours: 10,
      models: ['arome'],
    });
    expect(verdicts(result)).toEqual({
      cycling: 'good',
      hiking: 'good',
      laundry: 'good',
      gardening: 'good',
    });
  });

  it('chaque indice expose ses criteres, leur valeur et leurs seuils', () => {
    const result = practicalIndices({
      points: points((i) => ({ rain: i === 12 ? 1.5 : 0 })),
      now: NOW,
    });
    const cycling = result?.indices.find((index) => index.id === 'cycling');
    const rain = cycling?.criteria.find((c) => c.key === 'rain');
    expect(rain).toMatchObject({ value: 1.5, kind: 'max', status: 'fair' });
    expect(rain?.good).toBe(PRACTICAL_INDICES.cycling.rain.good);
    expect(rain?.fair).toBe(PRACTICAL_INDICES.cycling.rain.fair);
  });

  it('le pire critere decide : la pluie rend le linge et le velo mauvais, la randonnee passable', () => {
    const result = practicalIndices({
      points: points((i) => ({ rain: i === 12 ? 3 : 0 })),
      now: NOW,
    });
    expect(verdicts(result)).toEqual({
      cycling: 'poor',
      hiking: 'fair',
      laundry: 'poor',
      gardening: 'fair',
    });
  });

  it('les seuils sont inclusifs : la valeur limite reste dans la classe', () => {
    const result = practicalIndices({
      points: points(() => ({ gust: PRACTICAL_INDICES.cycling.gust.good })),
      now: NOW,
    });
    expect(verdicts(result).cycling).toBe('good');
    const above = practicalIndices({
      points: points(() => ({ gust: PRACTICAL_INDICES.cycling.gust.good + 1 })),
      now: NOW,
    });
    expect(verdicts(above).cycling).toBe('fair');
  });

  it('le froid et la chaleur jouent sur leurs bons criteres, le vent faible sur le linge', () => {
    const cold = practicalIndices({ points: points(() => ({ temperature: 4 })), now: NOW });
    expect(verdicts(cold)).toMatchObject({ cycling: 'fair', laundry: 'poor', gardening: 'good' });
    const hot = practicalIndices({ points: points(() => ({ temperature: 31 })), now: NOW });
    expect(verdicts(hot).cycling).toBe('fair');
    const calm = practicalIndices({ points: points(() => ({ wind: 1 })), now: NOW });
    expect(verdicts(calm).laundry).toBe('poor');
  });

  it('une heure sans valeur rend le critere inconnu, et l indice aussi, sauf s un autre critere est deja mauvais', () => {
    const missing = practicalIndices({
      points: points((i) => ({ rain: i === 14 ? null : 0 })),
      now: NOW,
    });
    expect(verdicts(missing)).toMatchObject({ cycling: 'unknown', laundry: 'unknown' });
    const cycling = missing?.indices.find((index) => index.id === 'cycling');
    expect(cycling?.criteria.find((c) => c.key === 'rain')).toMatchObject({
      value: null,
      status: 'unknown',
    });

    const worse = practicalIndices({
      points: points((i) => ({ rain: i === 14 ? null : 0, gust: 90 })),
      now: NOW,
    });
    expect(verdicts(worse).cycling).toBe('poor');
  });

  it('passe a demain quand il ne reste pas assez d heures de jour aujourd hui', () => {
    const result = practicalIndices({ points: points(), now: new Date('2026-09-28T17:30:00Z') });
    // 19 h 30 locale : une seule heure de jour aujourd'hui, trop courte.
    expect(result).toMatchObject({
      day: 'tomorrow',
      start: '2026-09-29T07:00',
      end: '2026-09-29T20:00',
      hours: 13,
    });
  });

  it('rend null sans heure de jour connue', () => {
    expect(practicalIndices({ points: [], now: NOW })).toBeNull();
    expect(practicalIndices({ points: points(() => ({ isDay: null })), now: NOW })).toBeNull();
  });

  it('nomme tous les modeles des heures jugees, le modele qui complete la pluie compris', () => {
    const base = points((i) => ({ model: i < 15 ? 'arome' : 'icon_eu' }));
    const filled = base.map((point, i) =>
      i === 12 ? { ...point, filledFrom: { precipitation: 'gfs' as const } } : point,
    );
    expect(practicalIndices({ points: filled, now: NOW })?.models).toEqual([
      'arome',
      'gfs',
      'icon_eu',
    ]);
  });
});
