import { describe, expect, it } from 'vitest';
import { LIGHTNING, lightningArea, lightningFrameTimes, mercatorPoint } from './lightning';

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
