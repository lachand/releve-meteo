import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, measure } from '../../tests/factories';
import { MODEL_ORDER } from './models';
import { DRIFT, stationTrace } from './stationTrace';
import type { StationModelSeries, StationRecord } from './stationCheck';
import type { LocalIsoHour, ModelId } from './types';

// Timeline locale du 28 septembre 2026 (UTC+2). Maintenant : 15 h 27 locale.
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 24);
const NOW = new Date('2026-09-28T13:27:00Z');

function record(time: LocalIsoHour, temperature: number | null): StationRecord {
  const observed = (value: number | null) => measure(value, 'observed');
  return {
    time,
    temperature: observed(temperature),
    humidity: observed(null),
    precipitation: observed(null),
    windSpeed: observed(null),
    windDirection: observed(null),
    windGust: observed(null),
    pressure: observed(null),
  };
}

const hourOf = (hour: number): LocalIsoHour => `2026-09-28T${String(hour).padStart(2, '0')}:00`;

/** Mesures de `from` a `to` heures, temperature donnee par `value(hour)`. */
function measured(from: number, to: number, value: (hour: number) => number | null) {
  return Array.from({ length: to - from + 1 }, (_, i) => record(hourOf(from + i), value(from + i)));
}

function models(
  entries: Partial<Record<ModelId, (hour: number) => number | null>>,
): StationModelSeries {
  const temperature: Partial<Record<ModelId, (number | null)[]>> = {};
  for (const [model, value] of Object.entries(entries) as [
    ModelId,
    (h: number) => number | null,
  ][]) {
    temperature[model] = TIMELINE.map((_, hour) => value(hour));
  }
  return { timeline: TIMELINE, temperature };
}

describe('stationTrace', () => {
  it('rend rien sans mesure de temperature avant maintenant', () => {
    expect(stationTrace({ records: [], models: models({ arome: () => 20 }), now: NOW })).toBeNull();
    expect(
      stationTrace({ records: measured(10, 12, () => null), models: null, now: NOW }),
    ).toBeNull();
    // Un releve du futur n'existe pas encore.
    expect(stationTrace({ records: [record(hourOf(20), 18)], models: null, now: NOW })).toBeNull();
  });

  it('aligne mesures et modeles sur l heure locale, jusqu au dernier releve', () => {
    const trace = stationTrace({
      records: measured(8, 12, (h) => 15 + (h - 8)),
      models: models({ arome: (h) => 16 + (h - 8) }),
      now: NOW,
    });
    expect(trace?.timeline).toEqual([8, 9, 10, 11, 12].map(hourOf));
    expect(trace?.observed).toEqual([15, 16, 17, 18, 19]);
    expect(trace?.byModel.arome).toEqual([16, 17, 18, 19, 20]);
  });

  it('laisse un trou plutot qu une valeur inventee quand une heure manque', () => {
    const records = [...measured(8, 9, () => 15), ...measured(11, 12, () => 16)];
    const trace = stationTrace({ records, models: models({ arome: () => 15 }), now: NOW });
    expect(trace?.timeline).toEqual([8, 9, 10, 11, 12].map(hourOf));
    expect(trace?.observed).toEqual([15, 15, null, 16, 16]);
  });

  it('borne la fenetre aux dernieres heures demandees', () => {
    const trace = stationTrace({
      records: measured(0, 12, () => 15),
      models: null,
      now: NOW,
      hours: 6,
    });
    expect(trace?.timeline[0]).toBe(hourOf(7));
    expect(trace?.timeline).toHaveLength(6);
    expect(trace?.byModel).toEqual({});
  });

  it('calcule la derive : ecart moyen des 3 dernieres heures contre les 3 precedentes', () => {
    const trace = stationTrace({
      records: measured(6, 12, () => 15),
      models: models({
        // Colle a la mesure, puis s'en ecarte de +1,5 °C : ecart croissant.
        arome: (h) => (h <= 9 ? 15 : 16.5),
        // Trop chaud de 2 °C au depart, revient vers la mesure.
        gfs: (h) => (h <= 9 ? 17 : 15.4),
        // Constamment +1 °C.
        ecmwf: () => 16,
        // Rien de mesure a comparer sur les dernieres heures.
        icon_eu: (h) => (h >= 10 ? null : 15),
      }),
      now: NOW,
    });
    const drift = Object.fromEntries((trace?.drifts ?? []).map((d) => [d.model, d]));
    expect(drift.arome?.recent).toBeCloseTo(1.5);
    expect(drift.arome?.earlier).toBeCloseTo(0);
    expect(drift.arome?.trend).toBe('widening');
    expect(drift.gfs?.recent).toBeCloseTo(0.4);
    expect(drift.gfs?.earlier).toBeCloseTo(2);
    expect(drift.gfs?.trend).toBe('narrowing');
    expect(drift.ecmwf?.trend).toBe('steady');
    expect(drift.icon_eu?.recent).toBeNull();
    expect(drift.icon_eu?.trend).toBeNull();
  });

  it('classe les modeles du plus proche au plus eloigne de la mesure recente', () => {
    const trace = stationTrace({
      records: measured(6, 12, () => 15),
      models: models({ arome: () => 17, gfs: () => 15.2, ecmwf: () => 14, icon_eu: () => null }),
      now: NOW,
    });
    expect(trace?.drifts.map((d) => d.model)).toEqual(['gfs', 'ecmwf', 'arome', 'icon_eu']);
  });

  it('tolere une serie de modele plus courte que sa timeline, et range ex aequo les modeles sans derive', () => {
    const short: StationModelSeries = {
      timeline: TIMELINE,
      // Deux valeurs seulement : les heures suivantes n'existent pas pour ce modele.
      temperature: {
        arome: [15, 15],
        gfs: TIMELINE.map(() => null),
        ecmwf: TIMELINE.map(() => null),
      },
    };
    const trace = stationTrace({ records: measured(0, 12, () => 15), models: short, now: NOW });
    expect(trace?.byModel.arome?.slice(0, 3)).toEqual([15, 15, null]);
    // Sans derive ni ecart, l'ordre du catalogue est conserve.
    expect(trace?.drifts.map((d) => d.model)).toEqual(
      MODEL_ORDER.filter((model) => ['arome', 'gfs', 'ecmwf'].includes(model)),
    );
    expect(trace?.drifts.every((d) => d.recent === null)).toBe(true);
  });

  it('laisse un trou pour les heures que la timeline des modeles ne couvre pas', () => {
    const late: StationModelSeries = {
      timeline: TIMELINE.slice(10),
      temperature: { arome: TIMELINE.slice(10).map(() => 15) },
    };
    const trace = stationTrace({ records: measured(8, 12, () => 15), models: late, now: NOW });
    expect(trace?.byModel.arome).toEqual([null, null, 15, 15, 15]);
  });

  it(`exige ${DRIFT.minPairs} paires par fenetre pour parler d une derive`, () => {
    const trace = stationTrace({
      records: measured(11, 12, () => 15),
      models: models({ arome: () => 18 }),
      now: NOW,
    });
    expect(trace?.drifts[0]).toEqual({
      model: 'arome',
      recent: null,
      earlier: null,
      trend: null,
    });
  });
});
