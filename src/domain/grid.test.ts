import { describe, expect, it } from 'vitest';
import {
  FORECAST_GRID,
  SPREAD_GRID_MODELS,
  cellBounds,
  gridPoints,
  lastCoveredIndex,
  spreadGrid,
  valueRange,
} from './grid';
import type { ForecastGrid } from './grid';

const LYON = { latitude: 45.7578, longitude: 4.832 };

function grid(temperature: readonly (readonly (number | null)[])[]): ForecastGrid {
  const points = gridPoints(LYON, 1);
  return {
    model: 'arome',
    provenance: 'forecast',
    points,
    stepKm: FORECAST_GRID.stepKm,
    times: temperature.map((_, index) => `2026-09-28T${String(16 + index).padStart(2, '0')}:00`),
    temperature,
    precipitation: temperature.map((row) => row.map(() => 0)),
    windSpeed: temperature.map((row) => row.map(() => 10)),
    windDirection: temperature.map((row) => row.map(() => 180)),
  };
}

describe('gridPoints', () => {
  it('pose une grille carree centree sur le lieu, du nord-ouest au sud-est', () => {
    const points = gridPoints(LYON);
    expect(points).toHaveLength(FORECAST_GRID.size * FORECAST_GRID.size);
    const center = points[(points.length - 1) / 2];
    expect(center).toMatchObject({ row: 4, col: 4, latitude: 45.7578, longitude: 4.832 });
    const first = points[0];
    const last = points.at(-1);
    expect(first?.row).toBe(0);
    expect(first?.col).toBe(0);
    // Rang 0 au nord, colonne 0 a l'ouest.
    expect(first?.latitude).toBeGreaterThan(LYON.latitude);
    expect(first?.longitude).toBeLessThan(LYON.longitude);
    expect(last?.latitude).toBeLessThan(LYON.latitude);
    expect(last?.longitude).toBeGreaterThan(LYON.longitude);
  });

  it('espace les points du pas demande, en kilometres, a toute latitude', () => {
    const points = gridPoints(LYON, 3, 10);
    const [north, , , west, center, east] = points;
    // 10 km en latitude : environ 0,0898 degre.
    expect((north?.latitude ?? 0) - (center?.latitude ?? 0)).toBeCloseTo(0.0898, 3);
    // 10 km en longitude a 45,76 degres : environ 0,1287 degre.
    expect((east?.longitude ?? 0) - (center?.longitude ?? 0)).toBeCloseTo(0.1287, 3);
    expect((center?.longitude ?? 0) - (west?.longitude ?? 0)).toBeCloseTo(0.1287, 3);
  });

  it('arrondit les coordonnees a quatre decimales, pour des URL et un cache stables', () => {
    for (const point of gridPoints({ latitude: 45.123456789, longitude: 4.987654321 }, 3)) {
      expect(point.latitude).toBe(Number(point.latitude.toFixed(4)));
      expect(point.longitude).toBe(Number(point.longitude.toFixed(4)));
    }
  });

  it('refuse une taille paire ou nulle : la grille doit avoir un centre', () => {
    expect(() => gridPoints(LYON, 4)).toThrow(RangeError);
    expect(() => gridPoints(LYON, 0)).toThrow(RangeError);
  });
});

describe('cellBounds', () => {
  it('borne une case a un demi-pas autour de son point', () => {
    const [point] = gridPoints(LYON, 1);
    if (point === undefined) {
      throw new Error('grille vide');
    }
    const bounds = cellBounds(point, 10);
    expect(bounds.north - bounds.south).toBeCloseTo(0.0898, 3);
    expect(bounds.east - bounds.west).toBeCloseTo(0.1287, 3);
    expect((bounds.north + bounds.south) / 2).toBeCloseTo(point.latitude, 6);
    expect((bounds.east + bounds.west) / 2).toBeCloseTo(point.longitude, 6);
  });
});

describe('lastCoveredIndex', () => {
  it('rend le dernier instant ou au moins une case a une valeur : la portee du modele', () => {
    expect(lastCoveredIndex(grid([[20], [null], [21], [null], [null]]))).toBe(2);
  });

  it('rend -1 quand aucune case n a de valeur', () => {
    expect(lastCoveredIndex(grid([[null], [null]]))).toBe(-1);
    expect(lastCoveredIndex(grid([]))).toBe(-1);
  });
});

describe('valueRange', () => {
  it('borne une serie en ignorant les null, jamais comptes comme zero', () => {
    expect(
      valueRange([
        [null, 12.5],
        [-3, null],
      ]),
    ).toEqual({ min: -3, max: 12.5 });
  });

  it('rend null sans aucune valeur', () => {
    expect(valueRange([[null], []])).toBeNull();
  });
});

describe('spreadGrid', () => {
  const points = gridPoints(LYON, 3, 10);
  function grid(
    model: ForecastGrid['model'],
    temperature: (number | null)[][],
    precipitation: (number | null)[][] = temperature.map((row) => row.map(() => 0)),
  ): ForecastGrid {
    return {
      model,
      provenance: 'forecast',
      points,
      stepKm: 10,
      times: temperature.map((_, i) => `2026-09-28T${String(10 + i).padStart(2, '0')}:00`),
      temperature,
      precipitation,
      windSpeed: temperature,
      windDirection: temperature,
    } as ForecastGrid;
  }
  const flat = (value: number | null) => Array.from({ length: 9 }, () => value);

  it('donne, case par case et heure par heure, l ecart entre le modele le plus haut et le plus bas', () => {
    const result = spreadGrid([
      grid('arome_france', [flat(10), flat(12)]),
      grid('arpege', [flat(13), flat(12.5)]),
      grid('gfs', [flat(11), flat(9)]),
    ]);
    expect(result?.models).toEqual(['arome_france', 'arpege', 'gfs']);
    expect(result?.grid.temperature[0]?.[0]).toBe(3);
    expect(result?.grid.temperature[1]?.[4]).toBe(3.5);
    expect(result?.grid.times).toHaveLength(2);
    expect(result?.grid.points).toBe(points);
  });

  it('calcule l ecart de pluie sur ses propres valeurs', () => {
    const result = spreadGrid([
      grid('arome_france', [flat(10)], [flat(0)]),
      grid('arpege', [flat(10)], [flat(2.5)]),
    ]);
    expect(result?.grid.precipitation[0]?.[0]).toBe(2.5);
    expect(result?.grid.temperature[0]?.[0]).toBe(0);
  });

  it('laisse une case a null quand moins de deux modeles ont une valeur, jamais un ecart nul', () => {
    const result = spreadGrid([
      grid('arome_france', [[...flat(10).slice(0, 8), null]]),
      grid('arpege', [[...flat(12).slice(0, 8), 14]]),
      grid('gfs', [[...flat(11).slice(0, 8), null]]),
    ]);
    expect(result?.grid.temperature[0]?.[0]).toBe(2);
    expect(result?.grid.temperature[0]?.[8]).toBeNull();
  });

  it('ne compare pas des grilles qui ne s alignent pas, et se tait sous deux modeles', () => {
    expect(spreadGrid([grid('arpege', [flat(1)])])).toBeNull();
    expect(spreadGrid([])).toBeNull();
    const shifted = { ...grid('gfs', [flat(2)]), times: ['2026-09-28T11:00'] } as ForecastGrid;
    const aligned = spreadGrid([grid('arpege', [flat(1)]), shifted]);
    expect(aligned).toBeNull();
    const fewer = { ...grid('gfs', [flat(2)]), points: points.slice(0, 4) } as ForecastGrid;
    expect(spreadGrid([grid('arpege', [flat(1)]), fewer])).toBeNull();
  });

  it('retient les modeles qui couvrent la zone, ordre du catalogue d ecart', () => {
    expect(SPREAD_GRID_MODELS.length).toBeGreaterThanOrEqual(3);
  });
});
