import { describe, expect, it } from 'vitest';
import type { StationModelSeries, StationRecord } from './stationCheck';
import { YESTERDAY, yesterdayReview } from './yesterdayReview';
import type { LocalIsoHour } from './types';

// Lundi 28 septembre 2026, 10 h 12 locales : hier est le dimanche 27.
const NOW = new Date('2026-09-28T08:12:00Z');

function hour(day: string, h: number): LocalIsoHour {
  return `${day}T${String(h).padStart(2, '0')}:00` as LocalIsoHour;
}

function record(time: LocalIsoHour, temperature: number | null): StationRecord {
  const measure = (value: number | null) => ({ value, provenance: 'observed' as const });
  return {
    time,
    temperature: measure(temperature),
    humidity: measure(null),
    precipitation: measure(null),
    windSpeed: measure(null),
    windDirection: measure(null),
    windGust: measure(null),
    pressure: measure(null),
  };
}

/** Mesures du 27 : 10 °C a 0 h, puis +1 °C par heure. */
function yesterdayRecords(skip: (h: number) => boolean = () => false): StationRecord[] {
  return Array.from({ length: 24 }, (_, h) =>
    record(hour('2026-09-27', h), skip(h) ? null : 10 + h),
  );
}

/** Previsions de la veille, du 26 a 0 h au 28 a 0 h, decalees de `offset` par rapport a la mesure. */
function forecast(offsets: Record<string, number>, nulls: (h: number) => boolean = () => false) {
  const timeline: LocalIsoHour[] = [];
  for (const day of ['2026-09-26', '2026-09-27']) {
    for (let h = 0; h < 24; h += 1) {
      timeline.push(hour(day, h));
    }
  }
  const temperature: StationModelSeries['temperature'] = {};
  for (const [model, offset] of Object.entries(offsets)) {
    temperature[model as keyof typeof temperature] = timeline.map((time) => {
      const h = Number(time.slice(11, 13));
      const isYesterday = time.startsWith('2026-09-27');
      return isYesterday && !nulls(h) ? 10 + h + offset : isYesterday ? null : 99;
    });
  }
  return { timeline, temperature } satisfies StationModelSeries;
}

describe('yesterdayReview', () => {
  it('compare, heure par heure, ce que chaque modele prevoyait hier a ce que la station a mesure', () => {
    const review = yesterdayReview({
      records: yesterdayRecords(),
      forecasts: forecast({ arome: 1, icon_eu: -2 }),
      now: NOW,
    });
    expect(review).toEqual({
      date: '2026-09-27',
      hours: 24,
      observedMin: 10,
      observedMax: 33,
      models: [
        { model: 'arome', pairs: 24, bias: 1, mae: 1, minGap: 1, maxGap: 1 },
        { model: 'icon_eu', pairs: 24, bias: -2, mae: 2, minGap: -2, maxGap: -2 },
      ],
    });
  });

  it('classe du plus proche au plus eloigne de la mesure, a egalite dans l ordre des modeles', () => {
    const review = yesterdayReview({
      records: yesterdayRecords(),
      forecasts: forecast({ gfs: -1, arome: 1, arpege: 3 }),
      now: NOW,
    });
    expect(review?.models.map((m) => m.model)).toEqual(['arome', 'gfs', 'arpege']);
  });

  it('ignore les mesures des autres jours et les heures sans mesure', () => {
    const records = [
      ...yesterdayRecords((h) => h >= 20),
      record(hour('2026-09-26', 23), 50),
      record(hour('2026-09-28', 1), -40),
    ];
    const review = yesterdayReview({
      records,
      forecasts: forecast({ arome: 1 }),
      now: NOW,
    });
    expect(review).toMatchObject({ hours: 20, observedMin: 10, observedMax: 29 });
    expect(review?.models[0]).toMatchObject({ pairs: 20, bias: 1 });
  });

  it('ne compte jamais une heure sans valeur du modele : elle ne produit aucun ecart', () => {
    const review = yesterdayReview({
      records: yesterdayRecords(),
      forecasts: forecast({ arome: 2 }, (h) => h < 6 || h === 12),
      now: NOW,
    });
    expect(review?.models[0]).toMatchObject({ pairs: 17, bias: 2, mae: 2 });
  });

  it('omet un modele qui n a pas assez d heures appariees', () => {
    const arome = forecast({ arome: 1 }).temperature.arome ?? [];
    const icon = forecast({ icon_eu: 1 }, (h) => h >= YESTERDAY.minHours - 1).temperature.icon_eu;
    const review = yesterdayReview({
      records: yesterdayRecords(),
      forecasts: { ...forecast({}), temperature: { arome, icon_eu: icon ?? [] } },
      now: NOW,
    });
    expect(review?.models.map((m) => m.model)).toEqual(['arome']);
  });

  it('rend null sans assez de mesures hier, sans previsions, ou sans modele utilisable', () => {
    expect(
      yesterdayReview({
        records: yesterdayRecords((h) => h >= YESTERDAY.minHours - 1),
        forecasts: forecast({ arome: 1 }),
        now: NOW,
      }),
    ).toBeNull();
    expect(yesterdayReview({ records: yesterdayRecords(), forecasts: null, now: NOW })).toBeNull();
    expect(
      yesterdayReview({
        records: yesterdayRecords(),
        forecasts: { timeline: [], temperature: {} },
        now: NOW,
      }),
    ).toBeNull();
  });

  it('change de jour a minuit de Paris, pas a minuit UTC', () => {
    // 22 h 30 UTC le 27 est 0 h 30 le 28 a Paris : hier est le 27. Une heure plus tot
    // (23 h 30 le 27 a Paris), hier est le 26 et rien n'y a ete mesure.
    const review = yesterdayReview({
      records: yesterdayRecords(),
      forecasts: forecast({ arome: 1 }),
      now: new Date('2026-09-27T22:30:00Z'),
    });
    expect(review?.date).toBe('2026-09-27');
    const earlier = yesterdayReview({
      records: yesterdayRecords(),
      forecasts: forecast({ arome: 1 }),
      now: new Date('2026-09-27T21:30:00Z'),
    });
    expect(earlier).toBeNull();
  });
});
