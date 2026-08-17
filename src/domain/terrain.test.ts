import { describe, expect, it } from 'vitest';
import coastlineFixture from '../../public/data/coastline-fr.json';
import { classifyTerrain, distanceToCoastKm, isWithinMetropolitanFrance } from './terrain';
import type { CoastlinePoint } from './terrain';

const coastline = coastlineFixture as readonly CoastlinePoint[];

describe('classifyTerrain', () => {
  it('classe mountain au-dessus de 900 m, loin de la cote', () => {
    expect(
      classifyTerrain({ latitude: 0, longitude: 0, elevation: 950, distanceToCoastKm: 50 }).kind,
    ).toBe('mountain');
  });

  it('classe plateau a 900 m exactement, pas mountain', () => {
    expect(
      classifyTerrain({ latitude: 0, longitude: 0, elevation: 900, distanceToCoastKm: 50 }).kind,
    ).toBe('plateau');
  });

  it('classe plateau a 301 m', () => {
    expect(
      classifyTerrain({ latitude: 0, longitude: 0, elevation: 301, distanceToCoastKm: 50 }).kind,
    ).toBe('plateau');
  });

  it('classe plain a 300 m exactement', () => {
    expect(
      classifyTerrain({ latitude: 0, longitude: 0, elevation: 300, distanceToCoastKm: 50 }).kind,
    ).toBe('plain');
  });

  it('classe coastal a 9,9 km meme a 1200 m, le littoral prime', () => {
    expect(
      classifyTerrain({ latitude: 0, longitude: 0, elevation: 1200, distanceToCoastKm: 9.9 }).kind,
    ).toBe('coastal');
  });

  it("n'est pas coastal a 10 km exactement", () => {
    expect(
      classifyTerrain({ latitude: 0, longitude: 0, elevation: 1200, distanceToCoastKm: 10 }).kind,
    ).not.toBe('coastal');
  });

  it('classe Val de Virieu en plateau', () => {
    const distance = distanceToCoastKm(45.4936, 5.4708, coastline);
    expect(
      classifyTerrain({
        latitude: 45.4936,
        longitude: 5.4708,
        elevation: 468,
        distanceToCoastKm: distance,
      }).kind,
    ).toBe('plateau');
  });

  it('classe le Golfe du Morbihan en coastal', () => {
    const distance = distanceToCoastKm(47.5667, -2.8167, coastline);
    expect(
      classifyTerrain({
        latitude: 47.5667,
        longitude: -2.8167,
        elevation: 5,
        distanceToCoastKm: distance,
      }).kind,
    ).toBe('coastal');
  });

  it('classe Chamonix en mountain', () => {
    const distance = distanceToCoastKm(45.9237, 6.8694, coastline);
    expect(
      classifyTerrain({
        latitude: 45.9237,
        longitude: 6.8694,
        elevation: 1035,
        distanceToCoastKm: distance,
      }).kind,
    ).toBe('mountain');
  });

  it('classe la Beauce en plain', () => {
    const distance = distanceToCoastKm(48.2, 1.7, coastline);
    expect(
      classifyTerrain({
        latitude: 48.2,
        longitude: 1.7,
        elevation: 140,
        distanceToCoastKm: distance,
      }).kind,
    ).toBe('plain');
  });
});

describe('distanceToCoastKm', () => {
  it('trouve moins de 3 km pour trois villes cotieres de reference', () => {
    expect(distanceToCoastKm(47.5667, -2.8167, coastline)).toBeLessThan(3);
    expect(distanceToCoastKm(41.9192, 8.7386, coastline)).toBeLessThan(3);
    expect(distanceToCoastKm(43.3728, -1.7739, coastline)).toBeLessThan(3);
  });

  it('retourne Infinity sur un littoral vide, sans exception', () => {
    expect(distanceToCoastKm(45, 5, [])).toBe(Infinity);
  });
});

describe('isWithinMetropolitanFrance', () => {
  it('est faux a Bruxelles', () => {
    expect(isWithinMetropolitanFrance(50.8503, 4.3517)).toBe(false);
  });

  it('est vrai en Corse', () => {
    expect(isWithinMetropolitanFrance(42.15, 9.1)).toBe(true);
  });

  it('est faux en Guadeloupe, hors perimetre', () => {
    expect(isWithinMetropolitanFrance(16.25, -61.55)).toBe(false);
  });
});
