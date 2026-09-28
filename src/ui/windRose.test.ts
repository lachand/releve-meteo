import { describe, expect, it } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place } from '../domain/types';
import { computeCascadeView } from './hooks/useCascadeView';
import type { CascadeView } from './hooks/useCascadeView';

// Minuit local le 17 aout 2026 : l'index 0 de la timeline est l'echeance 0.
const MIDNIGHT = new Date('2026-08-16T22:00:00Z');
const NO_SELECTION = { terrain: null, verification: [], preferred: null } as const;
import { guideStep, mainClass, windRoseData } from './windRose';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

function hourlyPoint(
  time: string,
  windDirection: number | null,
  windSpeed: number | null = 10,
): HourlyPoint {
  const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });
  return {
    time,
    temperature: measure(14),
    precipitation: measure(0),
    windSpeed: measure(windSpeed),
    windGust: measure(20),
    windDirection: measure(windDirection),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(0),
    humidity: measure(65),
    apparentTemperature: measure(13),
    precipitationProbability: measure(null),
    snowfall: measure(0),
    cape: measure(0),
    visibility: measure(20000),
    freezingLevel: measure(3000),
    weatherCode: 1,
    isDay: true,
  };
}

/** Cascade d'un bundle AROME seul, heure par heure depuis minuit. */
function cascadeOf(winds: readonly (readonly [number | null, number | null])[]): CascadeView {
  const timeline = winds.map((_, i) => `2026-08-17T${String(i).padStart(2, '0')}:00`);
  const bundle: ForecastBundle = {
    place,
    fetchedAt: 0,
    timeline,
    series: {
      arome: {
        model: 'arome',
        hourly: timeline.map((t, i) =>
          hourlyPoint(t, winds[i]?.[0] ?? null, winds[i]?.[1] ?? null),
        ),
        daily: [],
      },
    },
  };
  return computeCascadeView(bundle, NO_SELECTION, MIDNIGHT);
}

describe('windRoseData', () => {
  it('range chaque heure dans son secteur et sa classe de force', () => {
    const rose = windRoseData(
      cascadeOf([
        [0, 10], // N faible
        [350, 25], // N modere (350 degres arrondi au nord)
        [225, 45], // SO fort
        [225, 70], // SO tres fort
        [225, 30], // SO modere
        [90, 12], // E faible
      ]),
      0,
      24,
    );
    const byDirection = Object.fromEntries(rose.sectors.map((s) => [s.direction, s.byClass]));
    expect(byDirection.N).toEqual([1, 1, 0, 0]);
    expect(byDirection.SO).toEqual([0, 1, 1, 1]);
    expect(byDirection.E).toEqual([1, 0, 0, 0]);
    expect(rose.dominant?.direction).toBe('SO');
    expect(rose.dominant?.total).toBe(3);
    expect(rose.hours).toBe(6);
    expect(rose.models).toEqual(['arome']);
  });

  it('compte le calme a part, et ignore vitesse ou direction absentes', () => {
    const rose = windRoseData(
      cascadeOf([
        [180, 3], // calme, meme avec une direction
        [null, 2], // calme sans direction
        [180, null], // vitesse absente : ignoree
        [null, 30], // vent sans direction : ignore, jamais range au nord
        [180, 15],
      ]),
      0,
      24,
    );
    expect(rose.calm).toBe(2);
    expect(rose.hours).toBe(3);
    expect(rose.sectors.find((s) => s.direction === 'N')?.total).toBe(0);
    expect(rose.sectors.find((s) => s.direction === 'S')?.total).toBe(1);
  });

  it('borne la fenetre et rend un dominant nul sans heure orientee', () => {
    const rose = windRoseData(
      cascadeOf([
        [90, 2],
        [90, 20],
        [90, 20],
      ]),
      0,
      1,
    );
    expect(rose.calm).toBe(1);
    expect(rose.dominant).toBeNull();
    expect(windRoseData(cascadeOf([[90, 20]]), -5, 99).hours).toBe(1);
  });
});

describe('mainClass', () => {
  it('rend la classe la plus representee, la plus faible en cas d egalite', () => {
    expect(mainClass({ direction: 'N', byClass: [1, 3, 0, 0], total: 4 })).toBe('moderate');
    expect(mainClass({ direction: 'N', byClass: [2, 2, 0, 0], total: 4 })).toBe('light');
  });
});

describe('guideStep', () => {
  it.each([
    [0, 1],
    [3, 1],
    [7, 2],
    [18, 5],
    [36, 10],
    [48, 20],
  ])('%i heures : un cercle toutes les %i h', (hours, step) => {
    expect(guideStep(hours)).toBe(step);
  });
});
