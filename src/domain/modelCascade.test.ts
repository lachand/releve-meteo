import { describe, expect, it } from 'vitest';
import { blendByCascade, blendedPointAt, modelAt, transitionIndices } from './modelCascade';
import type { ForecastBundle, Place } from './types';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';

const place: Place = {
  id: '45.4936:5.4708',
  name: 'Val de Virieu',
  latitude: 45.4936,
  longitude: 5.4708,
  elevation: 468,
  admin: 'Isere',
  alias: null,
};

describe('transitionIndices', () => {
  it('retourne le debut de chaque segment sauf le premier', () => {
    const segments = [
      { model: 'arome' as const, startIndex: 0, endIndex: 35 },
      { model: 'arpege' as const, startIndex: 36, endIndex: 95 },
      { model: 'ecmwf' as const, startIndex: 96, endIndex: 200 },
    ];
    expect(transitionIndices(segments)).toEqual([36, 96]);
  });

  it('ne retourne aucune transition pour un segment unique ou vide', () => {
    expect(transitionIndices([{ model: 'arome', startIndex: 0, endIndex: 3 }])).toEqual([]);
    expect(transitionIndices([])).toEqual([]);
  });
});

describe('modelAt', () => {
  const segments = [
    { model: 'arome' as const, startIndex: 2, endIndex: 4 },
    { model: 'arpege' as const, startIndex: 5, endIndex: 8 },
  ];

  it('retourne le modele du segment contenant l index, bornes incluses', () => {
    expect(modelAt(segments, 2)).toBe('arome');
    expect(modelAt(segments, 4)).toBe('arome');
    expect(modelAt(segments, 5)).toBe('arpege');
  });

  it('retourne null hors cascade', () => {
    expect(modelAt(segments, 0)).toBeNull();
    expect(modelAt(segments, 9)).toBeNull();
  });
});

describe('blendByCascade', () => {
  it('porte le modele du segment correspondant sur chaque point', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 48);
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline,
      series: {
        arome: { model: 'arome', hourly: timeline.map((t) => hourlyPoint(t)), daily: [] },
        arpege: { model: 'arpege', hourly: timeline.map((t) => hourlyPoint(t)), daily: [] },
      },
    };
    const segments = [
      { model: 'arome' as const, startIndex: 0, endIndex: 23 },
      { model: 'arpege' as const, startIndex: 24, endIndex: 47 },
    ];
    const blended = blendByCascade(bundle, segments);

    expect(blended).toHaveLength(timeline.length);
    expect(blended[0]?.model).toBe('arome');
    expect(blended[23]?.model).toBe('arome');
    expect(blended[24]?.model).toBe('arpege');
  });

  it("ignore un index au-dela de la longueur reelle de la serie, si l'invariant de timeline commune est viole", () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 4);
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline,
      series: {
        arome: { model: 'arome', hourly: [hourlyPoint(timeline[0] ?? '')], daily: [] },
      },
    };
    const segments = [{ model: 'arome' as const, startIndex: 0, endIndex: 3 }];

    expect(blendByCascade(bundle, segments)).toHaveLength(1);
  });

  it('ignore un segment dont le modele est absent du bundle', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 4);
    const bundle: ForecastBundle = { place, fetchedAt: 0, timeline, series: {} };
    const segments = [{ model: 'arome' as const, startIndex: 0, endIndex: 3 }];

    expect(blendByCascade(bundle, segments)).toHaveLength(0);
  });
});

describe('blendedPointAt', () => {
  const timeline = buildHourlyTimeline('2026-08-17T00:00', 4);
  const bundle: ForecastBundle = {
    place,
    fetchedAt: 0,
    timeline,
    series: {
      arome: {
        model: 'arome',
        hourly: timeline.map((t, i) => hourlyPoint(t, { temperature: 10 + i })),
        daily: [],
      },
    },
  };
  const segments = [{ model: 'arome' as const, startIndex: 1, endIndex: 3 }];

  it('retourne le point du modele actif avec son modele', () => {
    const point = blendedPointAt(bundle, segments, 2);
    expect(point?.model).toBe('arome');
    expect(point?.temperature.value).toBe(12);
  });

  it('retourne null hors cascade ou si la serie manque', () => {
    expect(blendedPointAt(bundle, segments, 0)).toBeNull();
    expect(blendedPointAt(bundle, [{ model: 'arpege', startIndex: 0, endIndex: 3 }], 1)).toBeNull();
    expect(blendedPointAt(bundle, [{ model: 'arome', startIndex: 0, endIndex: 9 }], 8)).toBeNull();
  });
});

describe('completion des champs absents', () => {
  const timeline = buildHourlyTimeline('2026-08-17T00:00', 2);
  // AROME sans nebulosite ni code de temps ni pression, comme chez Open-Meteo.
  const bundle: ForecastBundle = {
    place,
    fetchedAt: 0,
    timeline,
    series: {
      arome: {
        model: 'arome',
        hourly: timeline.map((t) =>
          hourlyPoint(t, { cloudCover: null, weatherCode: null, pressure: null, visibility: null }),
        ),
        daily: [],
      },
      arome_france: {
        model: 'arome_france',
        hourly: timeline.map((t) =>
          hourlyPoint(t, { cloudCover: 80, weatherCode: 61, pressure: 1008, visibility: null }),
        ),
        daily: [],
      },
      gfs: {
        model: 'gfs',
        hourly: timeline.map((t) => hourlyPoint(t, { visibility: 9000, pressure: 1010 })),
        daily: [],
      },
    },
  };
  const segments = [{ model: 'arome' as const, startIndex: 0, endIndex: 1 }];

  it('prend chaque champ absent au modele le plus fin qui le fournit, et le dit', () => {
    const point = blendedPointAt(bundle, segments, 0);
    expect(point?.model).toBe('arome');
    expect(point?.cloudCover.value).toBe(80);
    expect(point?.weatherCode).toBe(61);
    expect(point?.pressure.value).toBe(1008);
    expect(point?.visibility.value).toBe(9000);
    expect(point?.filledFrom).toEqual({
      cloudCover: 'arome_france',
      weatherCode: 'arome_france',
      pressure: 'arome_france',
      visibility: 'gfs',
    });
    // La temperature vient toujours du modele retenu.
    expect(point?.temperature.value).toBe(14);
  });

  it('laisse un champ absent partout a null, sans inventer de valeur', () => {
    const lonely: ForecastBundle = {
      ...bundle,
      series: { arome: bundle.series.arome },
    };
    const point = blendedPointAt(lonely, segments, 1);
    expect(point?.cloudCover.value).toBeNull();
    expect(point?.weatherCode).toBeNull();
    expect(point?.filledFrom).toEqual({});
  });

  it('applique la meme completion a la serie fusionnee', () => {
    expect(blendByCascade(bundle, segments)[1]?.filledFrom.cloudCover).toBe('arome_france');
  });
});
