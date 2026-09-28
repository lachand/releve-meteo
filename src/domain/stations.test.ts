import { describe, expect, it } from 'vitest';
import { nearestStation } from './stations';
import type { Station } from './stations';

const bron: Station = {
  id: '07480',
  name: 'Lyon / Bron',
  latitude: 45.7264,
  longitude: 4.9389,
  elevation: 201,
};
const stExupery: Station = {
  id: '07481',
  name: 'Lyon / Saint-Exupéry',
  latitude: 45.7264,
  longitude: 5.0778,
  elevation: 248,
};
const mountain: Station = {
  id: 'X',
  name: 'Sommet',
  latitude: 45.8,
  longitude: 4.85,
  elevation: 900,
};
const unknownAlt: Station = {
  id: 'U',
  name: 'Inconnue',
  latitude: 45.77,
  longitude: 4.86,
  elevation: null,
};

// Lyon, place Bellecour : 45.7578, 4.8320, 170 m.
const lyon = { latitude: 45.7578, longitude: 4.832, elevation: 170 };

describe('nearestStation', () => {
  it('retient la station la plus proche qui respecte distance et denivele', () => {
    const match = nearestStation({ ...lyon, stations: [stExupery, bron] });
    expect(match?.station.id).toBe('07480');
    expect(nearestStation({ ...lyon, stations: [bron, stExupery] })?.station.id).toBe('07480');
    expect(match?.distanceKm).toBeGreaterThan(8);
    expect(match?.distanceKm).toBeLessThan(10);
    expect(match?.elevationDelta).toBe(31);
  });

  it('ecarte une station trop haute meme si elle est la plus proche', () => {
    const match = nearestStation({ ...lyon, stations: [mountain, bron] });
    expect(match?.station.id).toBe('07480');
  });

  it('ecarte une station trop lointaine', () => {
    expect(nearestStation({ ...lyon, stations: [bron], maxDistanceKm: 5 })).toBeNull();
  });

  it("n'accepte une altitude inconnue que tres pres du lieu", () => {
    expect(nearestStation({ ...lyon, stations: [unknownAlt] })?.elevationDelta).toBeNull();
    expect(nearestStation({ ...lyon, stations: [unknownAlt], maxDistanceKm: 6 })).toBeNull();
  });

  it('respecte un denivele maximal personnalise', () => {
    expect(nearestStation({ ...lyon, stations: [bron], maxElevationDeltaM: 20 })).toBeNull();
  });

  it('retourne null sans station', () => {
    expect(nearestStation({ ...lyon, stations: [] })).toBeNull();
  });
});
