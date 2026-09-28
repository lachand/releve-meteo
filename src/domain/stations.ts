import { haversineKm } from './terrain';

/*
 * Choix de la station d'observation de reference pour la verification
 * (ROADMAP.md C2). Une station ne represente un lieu que si elle en est
 * proche a la fois horizontalement et en altitude : a 300 m de denivele,
 * la temperature differe deja d'environ 2 °C, ce qui fausserait le
 * classement des modeles bien plus que leurs propres erreurs.
 */

export interface Station {
  readonly id: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number | null;
}

export interface StationMatch {
  readonly station: Station;
  readonly distanceKm: number;
  /** Altitude de la station moins altitude du lieu, m ; null si inconnue. */
  readonly elevationDelta: number | null;
}

export const STATION_MATCH = {
  maxDistanceKm: 30,
  maxElevationDeltaM: 200,
} as const;

/**
 * Station la plus proche qui respecte les deux criteres, ou null. Une
 * station d'altitude inconnue n'est retenue que si elle est a moins d'un
 * tiers de la distance maximale : prudence plutot qu'exclusion totale.
 */
export function nearestStation(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  readonly stations: readonly Station[];
  readonly maxDistanceKm?: number;
  readonly maxElevationDeltaM?: number;
}): StationMatch | null {
  const maxDistance = input.maxDistanceKm ?? STATION_MATCH.maxDistanceKm;
  const maxDelta = input.maxElevationDeltaM ?? STATION_MATCH.maxElevationDeltaM;
  let best: StationMatch | null = null;
  for (const station of input.stations) {
    const distanceKm = haversineKm(
      input.latitude,
      input.longitude,
      station.latitude,
      station.longitude,
    );
    if (distanceKm > maxDistance) {
      continue;
    }
    const elevationDelta = station.elevation === null ? null : station.elevation - input.elevation;
    if (
      elevationDelta === null ? distanceKm > maxDistance / 3 : Math.abs(elevationDelta) > maxDelta
    ) {
      continue;
    }
    if (best === null || distanceKm < best.distanceKm) {
      best = { station, distanceKm, elevationDelta };
    }
  }
  return best;
}
