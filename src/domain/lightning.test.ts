import { describe, expect, it } from 'vitest';
import {
  LIGHTNING,
  LIGHTNING_WATCH,
  inverseMercator,
  lightningArea,
  lightningFrameTimes,
  lightningNear,
  mercatorPoint,
} from './lightning';
import type { ActiveMask } from './lightning';

describe('lightningFrameTimes', () => {
  it('finit sur la derniere image publiee et remonte de 5 minutes en 5 minutes', () => {
    const latest = Date.UTC(2026, 9, 1, 11, 30);
    const times = lightningFrameTimes(latest);
    expect(times).toHaveLength(LIGHTNING.frames);
    expect(times.at(-1)).toBe(latest);
    expect(times[0]).toBe(latest - 23 * 5 * 60_000);
    expect(times[1]! - times[0]!).toBe(5 * 60_000);
  });

  it('accepte un autre nombre d images et un autre pas', () => {
    expect(lightningFrameTimes(600_000, 3, 1)).toEqual([480_000, 540_000, 600_000]);
  });
});

describe('mercatorPoint', () => {
  it("place l'equateur et le meridien d'origine a zero", () => {
    const origin = mercatorPoint(0, 0);
    expect(origin.x).toBe(0);
    expect(origin.y).toBeCloseTo(0, 6);
  });

  it('retrouve la valeur connue de Greenwich a 45 degres nord', () => {
    const { x, y } = mercatorPoint(45, 90);
    expect(x).toBeCloseTo(10018754.17, 1);
    expect(y).toBeCloseTo(5621521.49, 1);
  });
});

describe('lightningArea', () => {
  const lyon = { latitude: 45.75, longitude: 4.85 };

  it('couvre 600 km de cote autour du lieu', () => {
    const area = lightningArea(lyon);
    expect((area.north - area.south) * 111.32).toBeCloseTo(600, 0);
    expect((area.south + area.north) / 2).toBeCloseTo(lyon.latitude, 6);
    expect((area.west + area.east) / 2).toBeCloseTo(lyon.longitude, 6);
  });

  it('demande une image de la taille de la zone en Mercator, jamais deformee', () => {
    const area = lightningArea(lyon, 300, 640);
    const { minX, minY, maxX, maxY } = area.mercator;
    expect(area.width).toBe(640);
    expect(area.height).toBe(Math.round((640 * (maxY - minY)) / (maxX - minX)));
    // A cette latitude la projection etire le nord-sud : l'image est plus haute que large.
    expect(area.height).toBeGreaterThan(area.width);
  });

  it('suit une zone et une largeur choisies', () => {
    const area = lightningArea({ latitude: 0, longitude: 0 }, 100, 200);
    // A l equateur, la zone est carree.
    expect(area.height).toBe(200);
    expect(area.mercator.minX).toBeCloseTo(-area.mercator.maxX, 6);
  });
});

describe('inverseMercator', () => {
  it('rend la position projetee par mercatorPoint', () => {
    const { x, y } = mercatorPoint(45.49, 5.47);
    const back = inverseMercator(x, y);
    expect(back.latitude).toBeCloseTo(45.49, 8);
    expect(back.longitude).toBeCloseTo(5.47, 8);
  });
});

describe('lightningNear', () => {
  const virieu = { latitude: 45.49, longitude: 5.47 };
  const area = lightningArea(virieu, LIGHTNING_WATCH.halfExtentKm, LIGHTNING_WATCH.width);
  const { width, height } = area;
  const empty = (): boolean[] => Array.from({ length: width * height }, () => false);
  const mask = (...cells: readonly (readonly [number, number])[]): ActiveMask => {
    const active = empty();
    cells.forEach(([row, col]) => {
      active[row * width + col] = true;
    });
    return { width, height, active };
  };
  const middle = [Math.floor(height / 2), Math.floor(width / 2)] as const;
  const T0 = Date.UTC(2026, 9, 1, 13, 10);

  it('ne dit rien quand aucune image ne porte d eclair', () => {
    expect(
      lightningNear({ center: virieu, area, frames: [{ time: T0, mask: mask() }] }),
    ).toBeNull();
    expect(lightningNear({ center: virieu, area, frames: [] })).toBeNull();
  });

  it('situe un eclair au centre du lieu a quelques kilometres au plus', () => {
    const near = lightningNear({
      center: virieu,
      area,
      frames: [{ time: T0, mask: mask(middle) }],
    });
    expect(near?.cells).toBe(1);
    expect(near?.nearestKm).toBeLessThan(2);
    expect(near?.firstTime).toBe(T0);
    expect(near?.lastTime).toBe(T0);
  });

  it('ecarte un eclair au dela du rayon, meme dans l image', () => {
    // Coin nord-ouest : environ 45 km du centre pour une demi-zone de 32 km.
    expect(
      lightningNear({ center: virieu, area, frames: [{ time: T0, mask: mask([0, 0]) }] }),
    ).toBeNull();
  });

  it('compte une fois un meme pixel vu sur plusieurs images, et borne la periode', () => {
    const near = lightningNear({
      center: virieu,
      area,
      frames: [
        { time: T0, mask: mask(middle) },
        { time: T0 + 300_000, mask: mask() },
        { time: T0 + 600_000, mask: mask(middle, [middle[0] + 10, middle[1]]) },
      ],
    });
    expect(near?.cells).toBe(2);
    expect(near?.firstTime).toBe(T0);
    expect(near?.lastTime).toBe(T0 + 600_000);
    // Le plus proche est celui du centre, pas celui du pixel decale.
    expect(near?.nearestKm).toBeLessThan(2);
  });

  it('suit un rayon choisi', () => {
    const offset = mask([middle[0], middle[1] + 20]);
    expect(
      lightningNear({ center: virieu, area, frames: [{ time: T0, mask: offset }], radiusKm: 5 }),
    ).toBeNull();
    expect(
      lightningNear({ center: virieu, area, frames: [{ time: T0, mask: offset }], radiusKm: 30 })
        ?.cells,
    ).toBe(1);
  });
});
