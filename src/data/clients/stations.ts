import { nearestStation } from '../../domain/stations';
import type { Station, StationMatch } from '../../domain/stations';
import type { Place } from '../../domain/types';
import { request } from './http';

/*
 * Stations d'observation de France metropolitaine : liste statique generee
 * par `scripts/generate-stations.py`, servie avec l'application (donc
 * disponible hors ligne) et precachee par le service worker. Partagee par la
 * page (repository.ts) et par la veille en arriere-plan (pwa/snapshotRun.ts).
 */

let stationsPromise: Promise<readonly Station[]> | null = null;

/**
 * Liste vide si le fichier manque : la verification se replie alors sur la
 * reanalyse.
 */
export function loadStations(): Promise<readonly Station[]> {
  stationsPromise ??= request<readonly Station[]>('/data/stations-fr.json', { retries: 0 }).then(
    (result) => (result.ok && Array.isArray(result.value) ? result.value : []),
  );
  return stationsPromise;
}

/** Reinitialise la liste memorisee. Utilise par les tests. */
export function resetStationsForTests(): void {
  stationsPromise = null;
}

/** Station representative du lieu (distance et denivele bornes), ou null. */
export async function stationFor(place: Place): Promise<StationMatch | null> {
  return nearestStation({
    latitude: place.latitude,
    longitude: place.longitude,
    elevation: place.elevation,
    stations: await loadStations(),
  });
}
