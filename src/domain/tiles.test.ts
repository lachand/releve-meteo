import { describe, expect, it } from 'vitest';
import { TILE_PLAN, estimateTileBytes, tilePlan, tileUrl, tileXY } from './tiles';

describe('tileXY', () => {
  it('donne la tuile qui contient un point, au zoom demande', () => {
    // Lyon et Paris au zoom 9 : tuiles OpenStreetMap 262/182 et 259/176.
    expect(tileXY(45.7578, 4.832, 9)).toEqual({ z: 9, x: 262, y: 182 });
    expect(tileXY(48.8566, 2.3522, 9)).toEqual({ z: 9, x: 259, y: 176 });
    expect(tileXY(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1 });
    expect(tileXY(48.3904, -4.4861, 10)).toEqual({ z: 10, x: 499, y: 354 });
  });
});

describe('tilePlan', () => {
  const LYON = { latitude: 45.7578, longitude: 4.832 };
  const BRON = { latitude: 45.72, longitude: 4.93 };
  const BREST = { latitude: 48.3904, longitude: -4.4861 };

  it('couvre chaque lieu a chaque zoom, avec le voisinage demande', () => {
    const plan = tilePlan({ places: [LYON], zooms: [9, 10], radius: 1, maxTiles: 100 });
    expect(plan.tiles).toHaveLength(2 * 9);
    expect(plan.truncated).toBe(false);
    expect(plan.tiles.filter((t) => t.z === 9)).toHaveLength(9);
  });

  it('ne compte qu une fois les tuiles que deux lieux voisins partagent', () => {
    const one = tilePlan({ places: [LYON], zooms: [8], radius: 1, maxTiles: 100 });
    const two = tilePlan({ places: [LYON, BRON], zooms: [8], radius: 1, maxTiles: 100 });
    expect(two.tiles.length).toBeLessThan(2 * one.tiles.length);
    const keys = two.tiles.map((t) => `${t.z}/${t.x}/${t.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('se limite au plafond, et le dit, en gardant d abord le premier lieu', () => {
    const plan = tilePlan({ places: [LYON, BREST], zooms: [9], radius: 1, maxTiles: 12 });
    expect(plan.tiles).toHaveLength(12);
    expect(plan.truncated).toBe(true);
    // Les neuf tuiles du premier lieu sont gardees avant celles du second.
    expect(plan.tiles.slice(0, 9).every((t) => Math.abs(t.x - 262) <= 1)).toBe(true);
  });

  it('ne rend rien sans lieu, et ne depasse pas les bords de la carte', () => {
    expect(tilePlan({ places: [], zooms: [9], radius: 1, maxTiles: 10 })).toEqual({
      tiles: [],
      truncated: false,
    });
    const edge = tilePlan({
      places: [{ latitude: 0, longitude: -179.99 }],
      zooms: [2],
      radius: 2,
      maxTiles: 100,
    });
    expect(edge.tiles.every((t) => t.x >= 0 && t.x < 4 && t.y >= 0 && t.y < 4)).toBe(true);
  });

  it('a des reglages par defaut mesures', () => {
    expect(TILE_PLAN.maxTiles).toBeLessThanOrEqual(150);
    expect(TILE_PLAN.maxPlaces).toBeLessThanOrEqual(5);
  });
});

describe('tileUrl et estimateTileBytes', () => {
  it('remplit le gabarit de tuile', () => {
    expect(tileUrl('https://t.example/{z}/{x}/{y}.png', { z: 9, x: 262, y: 182 })).toBe(
      'https://t.example/9/262/182.png',
    );
  });

  it('estime le poids, et le dit estime : proportionnel au nombre de tuiles', () => {
    expect(estimateTileBytes(0)).toBe(0);
    expect(estimateTileBytes(100)).toBe(100 * TILE_PLAN.averageBytes);
  });
});
