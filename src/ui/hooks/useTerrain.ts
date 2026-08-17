import { useMemo } from 'react';
import coastlineFixture from '../../../public/data/coastline-fr.json';
import { classifyTerrain, distanceToCoastKm } from '../../domain/terrain';
import type { CoastlinePoint } from '../../domain/terrain';
import type { Place, TerrainProfile } from '../../domain/types';

const coastline = coastlineFixture as readonly CoastlinePoint[];

export function useTerrain(place: Place | null): TerrainProfile | null {
  return useMemo(() => {
    if (place === null) {
      return null;
    }
    const distance = distanceToCoastKm(place.latitude, place.longitude, coastline);
    return classifyTerrain({
      latitude: place.latitude,
      longitude: place.longitude,
      elevation: place.elevation,
      distanceToCoastKm: distance,
    });
  }, [place]);
}
