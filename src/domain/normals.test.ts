import { describe, expect, it } from 'vitest';
import { NORMALS, anomalyAgainst, dayNormal } from './normals';
import type { ClimateDaily } from './normals';

/** Une serie quotidienne sur `years` annees, de 2001 a 2000 + years, constante par defaut. */
function climate(
  years: number,
  value: (date: string) => { max: number | null; min: number | null },
): ClimateDaily {
  const dates: string[] = [];
  for (let year = 2001; year <= 2000 + years; year += 1) {
    for (let day = 0; day < 366; day += 1) {
      const d = new Date(Date.UTC(year, 0, 1 + day));
      if (d.getUTCFullYear() === year) {
        dates.push(d.toISOString().slice(0, 10));
      }
    }
  }
  return {
    dates,
    tempMax: dates.map((date) => value(date).max),
    tempMin: dates.map((date) => value(date).min),
  };
}

describe('dayNormal', () => {
  it('moyenne les maxima et minima autour de la date, sur toutes les annees', () => {
    const data = climate(25, (date) => ({
      max: date.slice(5) >= '09-20' && date.slice(5) <= '10-10' ? 20 : 5,
      min: date.slice(5) >= '09-20' && date.slice(5) <= '10-10' ? 10 : 0,
    }));
    expect(dayNormal(data, '09-28')).toEqual({ tempMax: 20, tempMin: 10, years: 25 });
  });

  it('ne retient que la fenetre autour de la date, et la voit circuler d une fin d annee a l autre', () => {
    // Un jour de la fenetre vaut 30, tous les autres 10 : la moyenne le dit.
    const data = climate(22, (date) => ({
      max: date.slice(5) === '09-30' ? 30 : 10,
      min: 0,
    }));
    const normal = dayNormal(data, '09-28');
    const windowDays = 2 * NORMALS.halfWindowDays + 1;
    expect(normal?.tempMax).toBeCloseTo(10 + 20 / windowDays);
    // 1er janvier : la fenetre englobe la fin decembre.
    const wrap = climate(22, (date) => ({
      max: date.slice(5) === '12-30' ? 40 : 10,
      min: 0,
    }));
    expect(dayNormal(wrap, '01-01')?.tempMax).toBeCloseTo(10 + 30 / windowDays);
  });

  it('ignore le 29 fevrier, et sait en donner la normale par le 28', () => {
    const data = climate(24, () => ({ max: 12, min: 4 }));
    expect(dayNormal(data, '02-29')).toEqual({ tempMax: 12, tempMin: 4, years: 24 });
  });

  it('ne compte pas une valeur absente comme zero', () => {
    const data = climate(22, (date) => ({
      max: date.slice(5) === '09-28' ? null : 20,
      min: 10,
    }));
    expect(dayNormal(data, '09-28')?.tempMax).toBe(20);
  });

  it('se tait sans assez d annees ou sans valeur', () => {
    expect(
      dayNormal(
        climate(NORMALS.minYears - 1, () => ({ max: 1, min: 1 })),
        '09-28',
      ),
    ).toBeNull();
    expect(
      dayNormal(
        climate(25, () => ({ max: null, min: null })),
        '09-28',
      ),
    ).toBeNull();
    expect(dayNormal({ dates: [], tempMax: [], tempMin: [] }, '09-28')).toBeNull();
  });

  it('ignore une date mal formee dans la serie', () => {
    const data = climate(25, () => ({ max: 1, min: 1 }));
    const dirty = {
      dates: [...data.dates, 'n-importe-quoi'],
      tempMax: [...data.tempMax, 99],
      tempMin: [...data.tempMin, 99],
    };
    expect(dayNormal(dirty, '09-28')?.tempMax).toBe(1);
  });

  it('rend null un jour de l annee illisible', () => {
    expect(
      dayNormal(
        climate(25, () => ({ max: 1, min: 1 })),
        '13-01',
      ),
    ).toBeNull();
    expect(
      dayNormal(
        climate(25, () => ({ max: 1, min: 1 })),
        '09-00',
      ),
    ).toBeNull();
    expect(
      dayNormal(
        climate(25, () => ({ max: 1, min: 1 })),
        'demain',
      ),
    ).toBeNull();
  });
});

describe('anomalyAgainst', () => {
  const normal = { tempMax: 20, tempMin: 10, years: 30 };

  it('dit l ecart du maximum et du minimum a la normale, signe', () => {
    expect(anomalyAgainst({ tempMax: 23.4, tempMin: 9 }, normal)).toEqual({
      max: expect.closeTo(3.4) as unknown as number,
      min: -1,
    });
  });

  it('laisse a null ce qui n a pas de valeur, jamais un ecart a zero', () => {
    expect(anomalyAgainst({ tempMax: null, tempMin: 12 }, normal)).toEqual({ max: null, min: 2 });
    expect(anomalyAgainst({ tempMax: 22, tempMin: null }, normal)).toEqual({ max: 2, min: null });
  });
});
