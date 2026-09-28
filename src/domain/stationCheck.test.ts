import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, measure } from '../../tests/factories';
import { STATION_CHECK, stationCheck } from './stationCheck';
import type { StationModelSeries, StationRecord } from './stationCheck';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Timeline locale du 28 septembre 2026 (heure d'ete, UTC+2), de minuit a
 * 23 h. Maintenant : 15 h 27 locale, soit 13 h 27 UTC.
 */
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 24);
const NOW = new Date('2026-09-28T13:27:00Z');

function record(
  time: LocalIsoHour,
  values: Partial<Record<Exclude<keyof StationRecord, 'time'>, number | null>> = {},
): StationRecord {
  const m = (field: Exclude<keyof StationRecord, 'time'>, fallback: number | null) =>
    measure(field in values ? (values[field] ?? null) : fallback, 'observed');
  return {
    time,
    temperature: m('temperature', 20),
    humidity: m('humidity', 60),
    precipitation: m('precipitation', null),
    windSpeed: m('windSpeed', 10),
    windDirection: m('windDirection', 180),
    windGust: m('windGust', null),
    pressure: m('pressure', 1015),
  };
}

/**
 * Temperatures des modeles au point de la station, meme forme d'appel que
 * `buildBundle` : 14 °C par defaut, surchargeable par (modele, index).
 */
function atStation(input: {
  readonly timeline: readonly LocalIsoHour[];
  readonly models: readonly ModelId[];
  readonly values?: (model: ModelId, index: number) => { readonly temperature?: number | null };
}): StationModelSeries {
  const temperature: Partial<Record<ModelId, (number | null)[]>> = {};
  for (const model of input.models) {
    temperature[model] = input.timeline.map((_, index) => {
      const values = input.values?.(model, index);
      return values !== undefined && 'temperature' in values ? (values.temperature ?? null) : 14;
    });
  }
  return { timeline: input.timeline, temperature };
}

/** Releves horaires de `from` a `to` inclus (heures locales du 28). */
function records(
  from: number,
  to: number,
  temperature: (hour: number) => number | null,
): StationRecord[] {
  const result: StationRecord[] = [];
  for (let hour = from; hour <= to; hour += 1) {
    const time = `2026-09-28T${String(hour).padStart(2, '0')}:00`;
    result.push(record(time, { temperature: temperature(hour) }));
  }
  return result;
}

describe('stationCheck', () => {
  it('retient le releve le plus recent qui porte une temperature, et calcule son age', () => {
    const models = atStation({ timeline: TIMELINE, models: ['arome'] });
    const check = stationCheck({
      records: [
        ...records(8, 11, () => 20),
        record('2026-09-28T12:00', { temperature: 26 }),
        // Plus recent, mais sans temperature : ignore pour le choix.
        record('2026-09-28T13:00', { temperature: null }),
      ],
      models,
      now: NOW,
    });
    expect(check?.latest.time).toBe('2026-09-28T12:00');
    expect(check?.latest.temperature).toEqual({ value: 26, provenance: 'observed' });
    // 12 h locale = 10 h UTC ; maintenant 13 h 27 UTC.
    expect(check?.ageMinutes).toBe(207);
    expect(check?.stale).toBe(false);
  });

  it('ignore un releve horodate dans le futur', () => {
    const models = atStation({ timeline: TIMELINE, models: ['arome'] });
    const check = stationCheck({
      records: [...records(10, 12, () => 21), record('2026-09-28T18:00', { temperature: 30 })],
      models,
      now: NOW,
    });
    expect(check?.latest.time).toBe('2026-09-28T12:00');
  });

  it('signale un releve ancien au dela de staleAfterHours', () => {
    const models = atStation({ timeline: TIMELINE, models: ['arome'] });
    const check = stationCheck({
      records: records(2, 5, () => 15),
      models,
      now: NOW,
    });
    expect(check?.latest.time).toBe('2026-09-28T05:00');
    expect(check?.ageMinutes).toBeGreaterThan(STATION_CHECK.staleAfterHours * 60);
    expect(check?.stale).toBe(true);
  });

  it('rend le releve sans ecart quand les valeurs au point de la station manquent', () => {
    const check = stationCheck({ records: records(8, 12, () => 22), models: null, now: NOW });
    expect(check?.latest.time).toBe('2026-09-28T12:00');
    expect(check?.gaps).toEqual([]);
  });

  it('renvoie null sans aucun releve de temperature', () => {
    const models = atStation({ timeline: TIMELINE, models: ['arome'] });
    expect(stationCheck({ records: [], models, now: NOW })).toBeNull();
    expect(stationCheck({ records: records(8, 12, () => null), models, now: NOW })).toBeNull();
  });

  it("compare chaque modele a la mesure a l'heure du releve, ecart = modele moins mesure", () => {
    const models = atStation({
      timeline: TIMELINE,
      models: ['arome', 'ecmwf'],
      values: (model) => ({ temperature: model === 'arome' ? 25.4 : 23 }),
    });
    const check = stationCheck({ records: records(7, 12, () => 26), models, now: NOW });
    const arome = check?.gaps.find((gap) => gap.model === 'arome');
    const ecmwf = check?.gaps.find((gap) => gap.model === 'ecmwf');
    expect(arome?.temperature).toBe(25.4);
    expect(arome?.gap).toBeCloseTo(-0.6, 5);
    expect(ecmwf?.gap).toBeCloseTo(-3, 5);
  });

  it("calcule l'ecart moyen sur les heures relevees recentes", () => {
    // Le modele donne 20 °C toute la journee ; la station mesure 20 + (h - 10).
    const models = atStation({
      timeline: TIMELINE,
      models: ['arome'],
      values: () => ({ temperature: 20 }),
    });
    const check = stationCheck({
      records: records(0, 12, (hour) => 20 + (hour - 10)),
      models,
      now: NOW,
    });
    const arome = check?.gaps[0];
    // Fenetre de 6 h se terminant au releve de 12 h : 7 h a 12 h.
    // Mesures 17..22, ecarts 3, 2, 1, 0, -1, -2 : moyenne 0,5.
    expect(arome?.recentPairs).toBe(STATION_CHECK.recentHours);
    expect(arome?.recentMeanGap).toBeCloseTo(0.5, 5);
  });

  it("ne donne pas d'ecart moyen avec trop peu de paires", () => {
    const models = atStation({
      timeline: TIMELINE,
      models: ['arome'],
      values: (_, index) => ({ temperature: index >= 11 ? 20 : null }),
    });
    const check = stationCheck({ records: records(7, 12, () => 21), models, now: NOW });
    expect(check?.gaps[0]?.recentPairs).toBe(2);
    expect(check?.gaps[0]?.recentMeanGap).toBeNull();
    expect(check?.gaps[0]?.gap).toBeCloseTo(-1, 5);
  });

  it("garde null, jamais zero, quand le modele n'a pas de valeur a l'heure du releve", () => {
    const models = atStation({
      timeline: TIMELINE,
      models: ['arome'],
      values: (_, index) => ({ temperature: index === 12 ? null : 20 }),
    });
    const check = stationCheck({ records: records(7, 12, () => 21), models, now: NOW });
    expect(check?.gaps[0]?.temperature).toBeNull();
    expect(check?.gaps[0]?.gap).toBeNull();
    // Les heures precedentes restent comparables.
    expect(check?.gaps[0]?.recentPairs).toBe(5);
  });

  it("n'aligne jamais par index : une heure absente de la timeline reste sans valeur", () => {
    const models = atStation({
      timeline: buildHourlyTimeline('2026-09-28T13:00', 11),
      models: ['arome'],
    });
    const check = stationCheck({ records: records(7, 12, () => 21), models, now: NOW });
    expect(check?.gaps[0]?.temperature).toBeNull();
    expect(check?.gaps[0]?.recentPairs).toBe(0);
  });

  it('classe les modeles du plus proche au plus eloigne de la mesure, sans ecart en dernier', () => {
    const models = atStation({
      timeline: TIMELINE,
      models: ['arome', 'icon_d2', 'ecmwf', 'gfs'],
      values: (model) => {
        switch (model) {
          case 'arome':
            return { temperature: 22.5 };
          case 'icon_d2':
            return { temperature: 20.8 };
          case 'ecmwf':
            return { temperature: 18 };
          default:
            return { temperature: null };
        }
      },
    });
    const check = stationCheck({ records: records(7, 12, () => 21), models, now: NOW });
    expect(check?.gaps.map((gap) => gap.model)).toEqual(['icon_d2', 'arome', 'ecmwf', 'gfs']);
  });

  it("departage deux modeles a egalite par l'ordre du catalogue", () => {
    const models = atStation({
      timeline: TIMELINE,
      models: ['gfs', 'arome'],
      values: () => ({ temperature: 22 }),
    });
    const check = stationCheck({ records: records(7, 12, () => 21), models, now: NOW });
    expect(check?.gaps.map((gap) => gap.model)).toEqual(['arome', 'gfs']);
  });

  it('classe sur l ecart a l heure du releve quand aucun ecart moyen n existe', () => {
    const models = atStation({
      timeline: TIMELINE,
      models: ['arome', 'ecmwf'],
      values: (model) => ({ temperature: model === 'arome' ? 24 : 21.5 }),
    });
    // Un seul releve : pas d'ecart moyen, le classement suit l'ecart ponctuel.
    const check = stationCheck({
      records: [record('2026-09-28T12:00', { temperature: 21 })],
      models,
      now: NOW,
    });
    expect(check?.gaps.map((gap) => gap.model)).toEqual(['ecmwf', 'arome']);
    expect(check?.gaps[0]?.recentMeanGap).toBeNull();
  });

  it("ne compte comme recente qu'une heure de la fenetre, jamais une plus ancienne", () => {
    const models = atStation({
      timeline: TIMELINE,
      models: ['arome'],
      values: () => ({ temperature: 20 }),
    });
    // Releves de 0 h a 5 h puis de 11 h a 12 h : seules 11 h et 12 h sont
    // dans la fenetre de 6 h qui se termine a 12 h.
    const check = stationCheck({
      records: [...records(0, 5, () => 10), ...records(11, 12, () => 21)],
      models,
      now: NOW,
    });
    expect(check?.gaps[0]?.recentPairs).toBe(2);
  });
});
