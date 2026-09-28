import { useMemo } from 'react';
import coastlineFixture from '../../../public/data/coastline-fr.json';
import { classifyTerrain, distanceToCoastKm } from '../../domain/terrain';
import type { CoastlinePoint } from '../../domain/terrain';
import type { Place, TerrainProfile } from '../../domain/types';

const coastline = coastlineFixture as readonly CoastlinePoint[];

/** Terrain d'un lieu (cote, montagne, plateau, plaine), hors React. */
export function terrainOf(place: Place): TerrainProfile {
  return classifyTerrain({
    latitude: place.latitude,
    longitude: place.longitude,
    elevation: place.elevation,
    distanceToCoastKm: distanceToCoastKm(place.latitude, place.longitude, coastline),
  });
}

export function useTerrain(place: Place | null): TerrainProfile | null {
  return useMemo(() => (place === null ? null : terrainOf(place)), [place]);
}
