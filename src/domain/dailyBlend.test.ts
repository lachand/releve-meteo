import { describe, expect, it } from 'vitest';
import { buildBundle, buildHourlyTimeline, dailyPoint } from '../../tests/factories';
import { blendDaily, coversWholeDay } from './dailyBlend';
import type { SelectionContext } from './modelSelection';
import type { ForecastBundle, ModelId } from './types';

// Trois jours complets a partir du 17 aout 2026, heure locale.
const timeline = buildHourlyTimeline('2026-08-17T00:00', 72);
const dates = ['2026-08-17', '2026-08-18', '2026-08-19'];
// Midi local le 17 aout (UTC+2).
const now = new Date('2026-08-17T10:00:00Z');

function context(available: readonly ModelId[]): SelectionContext {
  return { latitude: 45.76, longitude: 4.84, terrain: 'plain', available, verification: [] };
}

/** AROME couvre jusqu'au 18 a 14h ; ECMWF couvre tout. */
function bundle(): ForecastBundle {
  const base = buildBundle({
    timeline,
    models: ['arome', 'ecmwf'],
    values: (model, index) => ({
      temperature: model === 'arome' && index > 38 ? null : 15,
    }),
  });
  return {
    ...base,
    series: {
      arome: {
        model: 'arome',
        hourly: base.series.arome?.hourly ?? [],
        daily: dates.map((d) => dailyPoint(d, { tempMax: 25 })),
      },
      ecmwf: {
        model: 'ecmwf',
        hourly: base.series.ecmwf?.hourly ?? [],
        daily: [
          dailyPoint('2026-08-16', { tempMax: 20 }),
          ...dates.map((d) => dailyPoint(d, { tempMax: 22 })),
        ],
      },
    },
  };
}

describe('coversWholeDay', () => {
  it('exige une temperature a chaque heure du jour', () => {
    const b = bundle();
    expect(coversWholeDay(b, 'arome', '2026-08-17')).toBe(true);
    expect(coversWholeDay(b, 'arome', '2026-08-18')).toBe(false);
    expect(coversWholeDay(b, 'ecmwf', '2026-08-19')).toBe(true);
  });

  it('refuse un modele absent ou une date tronquee', () => {
    const b = bundle();
    expect(coversWholeDay(b, 'gfs', '2026-08-17')).toBe(false);
    expect(coversWholeDay(b, 'ecmwf', '2026-08-20')).toBe(false);
  });
});

describe('blendDaily', () => {
  it('retient le meilleur modele qui couvre la journee entiere, a partir d aujourd hui', () => {
    const days = blendDaily({ bundle: bundle(), context: context(['arome', 'ecmwf']), now });
    expect(days.map((d) => `${d.date}:${d.model}`)).toEqual([
      '2026-08-17:arome',
      '2026-08-18:ecmwf',
      '2026-08-19:ecmwf',
    ]);
    expect(days[0]?.tempMax.value).toBe(25);
  });

  it('honore le choix manuel quand il couvre la journee', () => {
    const days = blendDaily({
      bundle: bundle(),
      context: context(['arome', 'ecmwf']),
      now,
      preferred: 'ecmwf',
    });
    expect(days.map((d) => d.model)).toEqual(['ecmwf', 'ecmwf', 'ecmwf']);
  });

  it('ignore les modeles indisponibles et les jours sans modele complet', () => {
    const days = blendDaily({ bundle: bundle(), context: context(['arome']), now });
    expect(days.map((d) => d.date)).toEqual(['2026-08-17']);
  });

  it('ignore un jour dont le maximum est absent', () => {
    const b = bundle();
    const noMax: ForecastBundle = {
      ...b,
      series: {
        ...b.series,
        ecmwf: {
          model: 'ecmwf',
          hourly: b.series.ecmwf?.hourly ?? [],
          daily: dates.map((d) => dailyPoint(d, { tempMax: null })),
        },
      },
    };
    const days = blendDaily({ bundle: noMax, context: context(['ecmwf']), now });
    expect(days).toEqual([]);
    const missingDay: ForecastBundle = {
      ...b,
      series: {
        ...b.series,
        ecmwf: { model: 'ecmwf', hourly: b.series.ecmwf?.hourly ?? [], daily: [] },
        arome: { model: 'arome', hourly: [], daily: [dailyPoint('2026-08-18')] },
      },
    };
    expect(blendDaily({ bundle: missingDay, context: context(['ecmwf', 'arome']), now })).toEqual(
      [],
    );
  });
});

describe('completion des champs quotidiens', () => {
  it('prend le code de temps et l indice UV absents chez le modele retenu, en le nommant', () => {
    const b = bundle();
    const withGaps: ForecastBundle = {
      ...b,
      series: {
        ...b.series,
        arome: {
          model: 'arome',
          hourly: b.series.arome?.hourly ?? [],
          daily: dates.map((d) =>
            dailyPoint(d, { tempMax: 25, weatherCode: null, uvIndexMax: null, sunrise: null }),
          ),
        },
      },
    };
    const [today] = blendDaily({ bundle: withGaps, context: context(['arome', 'ecmwf']), now });
    expect(today?.model).toBe('arome');
    expect(today?.tempMax.value).toBe(25);
    expect(today?.weatherCode).toBe(1);
    expect(today?.uvIndexMax.value).toBe(5);
    expect(today?.sunrise).toBe('2026-08-17T07:30');
    expect(today?.filledFrom).toEqual({
      weatherCode: 'ecmwf',
      uvIndexMax: 'ecmwf',
      sunrise: 'ecmwf',
    });
  });

  it('laisse le champ vide si aucun autre modele ne le fournit', () => {
    const b = bundle();
    const alone: ForecastBundle = {
      ...b,
      series: {
        arome: {
          model: 'arome',
          hourly: b.series.arome?.hourly ?? [],
          daily: dates.map((d) => dailyPoint(d, { weatherCode: null })),
        },
        ecmwf: {
          model: 'ecmwf',
          hourly: b.series.ecmwf?.hourly ?? [],
          daily: dates.map((d) => dailyPoint(d, { weatherCode: null })),
        },
      },
    };
    const [today] = blendDaily({ bundle: alone, context: context(['arome', 'ecmwf']), now });
    expect(today?.weatherCode).toBeNull();
    expect(today?.filledFrom).toEqual({});
  });
});
