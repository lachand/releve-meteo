import { describe, expect, it } from 'vitest';
import type { DailyPoint, ForecastBundle, Place } from '../domain/types';
import { blendDaily } from './dailyBlend';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });

function daily(date: string, tempMax: number | null): DailyPoint {
  return {
    date,
    tempMax: measure(tempMax),
    tempMin: measure(tempMax === null ? null : tempMax - 10),
    precipitationSum: measure(0),
    uvIndexMax: measure(5),
    sunrise: `${date}T06:30`,
    sunset: `${date}T21:00`,
    weatherCode: 1,
  };
}

describe('blendDaily', () => {
  it("prefere le modele le plus fin pour les jours qu'il couvre", () => {
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline: [],
      series: {
        arome: {
          model: 'arome',
          hourly: [],
          daily: [daily('2026-08-17', 30), daily('2026-08-18', null)],
        },
        gfs: {
          model: 'gfs',
          hourly: [],
          daily: [daily('2026-08-17', 10), daily('2026-08-18', 25), daily('2026-08-19', 26)],
        },
      },
    };
    const blended = blendDaily(bundle);
    expect(blended.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
    expect(blended[0]?.tempMax.value).toBe(30); // AROME couvre ce jour, priorite sur GFS
    expect(blended[1]?.tempMax.value).toBe(25); // AROME est null ce jour-la, repli sur GFS
  });

  it('retourne un tableau vide sans modele disponible', () => {
    const bundle: ForecastBundle = { place, fetchedAt: 0, timeline: [], series: {} };
    expect(blendDaily(bundle)).toEqual([]);
  });
});
