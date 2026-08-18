import { describe, expect, it } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place } from '../domain/types';
import type { CascadeView } from './hooks/useCascadeView';
import { windRoseBuckets } from './windRose';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

function hourlyPoint(time: string, windDirection: number | null): HourlyPoint {
  const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });
  return {
    time,
    temperature: measure(14),
    precipitation: measure(0),
    windSpeed: measure(10),
    windGust: measure(20),
    windDirection: measure(windDirection),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(0),
    weatherCode: 1,
  };
}

describe('windRoseBuckets', () => {
  it('compte les heures par secteur de 45 degres', () => {
    const directions = [0, 45, 90, 180, 180, null];
    const timeline = directions.map((_, i) => `2026-08-17T0${i}:00`);
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline,
      series: {
        arome: {
          model: 'arome',
          hourly: timeline.map((t, i) => hourlyPoint(t, directions[i] ?? null)),
          daily: [],
        },
      },
    };
    const cascade: CascadeView = {
      segments: [{ model: 'arome', startIndex: 0, endIndex: timeline.length - 1 }],
      blended: [],
      transitions: [],
      nowIndex: 0,
      activeModel: 'arome',
      available: ['arome'],
    };

    const buckets = windRoseBuckets(bundle, cascade, 0, timeline.length);
    const byDirection = Object.fromEntries(buckets.map((b) => [b.direction, b.count]));

    expect(byDirection.N).toBe(1);
    expect(byDirection.NE).toBe(1);
    expect(byDirection.E).toBe(1);
    expect(byDirection.S).toBe(2);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(5); // le null est ignore
  });

  it('ignore les heures hors fenetre', () => {
    const timeline = ['2026-08-17T00:00', '2026-08-17T01:00'];
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline,
      series: {
        arome: {
          model: 'arome',
          hourly: [hourlyPoint(timeline[0] ?? '', 0), hourlyPoint(timeline[1] ?? '', 90)],
          daily: [],
        },
      },
    };
    const cascade: CascadeView = {
      segments: [{ model: 'arome', startIndex: 0, endIndex: 1 }],
      blended: [],
      transitions: [],
      nowIndex: 0,
      activeModel: 'arome',
      available: ['arome'],
    };

    const buckets = windRoseBuckets(bundle, cascade, 0, 1);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(1);
  });
});
