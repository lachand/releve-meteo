import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint, measure } from '../../tests/factories';
import { RAIN_CHECK, rainCheck } from './rainCheck';
import type { StationRecord } from './stationCheck';
import type { HourlyPoint } from './types';

// Lundi 28 septembre 2026, 15 h 27 locales : la derniere heure complete est 15 h
// comptee dans la fenetre (14 h 00 a 15 h 00 incluses jusqu'a 24 h en arriere).
const NOW = new Date('2026-09-28T13:27:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-27T00:00', 48);

function forecast(rain: (index: number) => number | null): HourlyPoint[] {
  return TIMELINE.map((time, index) => hourlyPoint(time, { precipitation: rain(index) }));
}

function record(time: string, rain: number | null): StationRecord {
  const none = measure(null, 'observed');
  return {
    time: time as StationRecord['time'],
    temperature: none,
    humidity: none,
    precipitation: measure(rain, 'observed'),
    windSpeed: none,
    windDirection: none,
    windGust: none,
    pressure: none,
  };
}

/** Une mesure par heure de la timeline, de la plus ancienne a maintenant. */
function records(rain: (index: number) => number | null): StationRecord[] {
  return TIMELINE.flatMap((time, index) =>
    time <= '2026-09-28T15:00' ? [record(time, rain(index))] : [],
  );
}

describe('rainCheck', () => {
  it('compare le cumul mesure au cumul calcule sur les memes heures', () => {
    // Index 24 = 28/09 00 h. Fenetre : 24 heures finissant a 15 h, soit les index 16 a 39 ;
    // seules celles jusqu'a 15 h (index 39) existent cote station.
    const result = rainCheck({
      records: records((i) => (i === 30 || i === 31 ? 1.1 : 0)),
      model: 'arome',
      hourly: forecast((i) => (i === 30 ? 2 : i === 31 ? 2.1 : 0)),
      now: NOW,
    });
    expect(result).toMatchObject({
      model: 'arome',
      paired: RAIN_CHECK.hours,
      missing: 0,
      observedMm: 2.2,
      forecastMm: 4.1,
    });
  });

  it('ne compte pas une heure sans mesure comme zero, et la dit', () => {
    const result = rainCheck({
      // La mesure de 15 h n'est pas encore publiee ; celle de 14 h manque (valeur nulle).
      records: records((i) => (i === 39 || i === 38 ? null : i === 30 ? 1 : 0)),
      model: 'arpege',
      hourly: forecast((i) => (i === 30 ? 0.5 : i === 38 || i === 39 ? 9 : 0)),
      now: NOW,
    });
    expect(result?.missing).toBe(2);
    expect(result?.paired).toBe(RAIN_CHECK.hours - 2);
    // Les 9 mm des heures non mesurees ne comptent ni d'un cote ni de l'autre.
    expect(result?.forecastMm).toBe(0.5);
    expect(result?.observedMm).toBe(1);
  });

  it('compte comme manquante une heure sans enregistrement de la station', () => {
    const partial = records(() => 0).filter((r) => r.time !== '2026-09-28T09:00');
    const result = rainCheck({
      records: partial,
      model: 'arome',
      hourly: forecast(() => 0),
      now: NOW,
    });
    expect(result).toMatchObject({ missing: 1, paired: RAIN_CHECK.hours - 1 });
  });

  it('ignore une heure sans valeur calculee, sans la compter comme zero', () => {
    const result = rainCheck({
      records: records(() => 1),
      model: 'arome',
      hourly: forecast((i) => (i === 30 ? null : 0)),
      now: NOW,
    });
    expect(result?.paired).toBe(RAIN_CHECK.hours - 1);
    expect(result?.observedMm).toBe(RAIN_CHECK.hours - 1);
    expect(result?.forecastMm).toBe(0);
  });

  it('se tait sans assez d heures appariees (station sans cumul de pluie, par exemple)', () => {
    expect(
      rainCheck({
        records: records(() => null),
        model: 'arome',
        hourly: forecast(() => 0),
        now: NOW,
      }),
    ).toBeNull();
    expect(
      rainCheck({ records: [], model: 'arome', hourly: forecast(() => 0), now: NOW }),
    ).toBeNull();
    const eleven = records((i) => (i >= 29 ? 0 : null));
    expect(
      rainCheck({ records: eleven, model: 'arome', hourly: forecast(() => 0), now: NOW }),
    ).toBeNull();
  });

  it('ne regarde pas plus loin que la fenetre, ni l avenir', () => {
    const result = rainCheck({
      // 10 mm la veille avant la fenetre, et 10 mm prevus demain : ni l'un ni l'autre ne compte.
      records: records((i) => (i < 16 ? 10 : 0)),
      model: 'arome',
      hourly: forecast((i) => (i > 39 ? 10 : 0)),
      now: NOW,
    });
    expect(result).toMatchObject({ observedMm: 0, forecastMm: 0 });
  });
});
