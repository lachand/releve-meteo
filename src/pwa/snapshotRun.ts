import { recordSnapshot } from '../data/cache/snapshotStore';
import { stationFor } from '../data/clients/stations';
import { fetchStationPoint } from '../data/clients/openMeteo';
import { takeSnapshot } from '../domain/leadScores';
import { MODEL_ORDER } from '../domain/models';
import type { WatchEntry } from '../domain/watch';

/*
 * Collecte des instantanes de prevision depuis la veille en arriere-plan :
 * les notes de 1 a 12 h (domain/leadScores.ts) ne dependent ainsi plus de
 * l'ouverture de l'application. Pour chaque lieu veille, les 12 heures a
 * venir de chaque modele au point de la station representative, comme le fait
 * la page a chaque lecture de la station. Sans permission de notification :
 * rien n'est affiche, seules les heures sont enregistrees.
 */

/** Lieux traites par execution, favoris d'abord : une requete Open-Meteo chacun. */
export const SNAPSHOT_MAX_PLACES = 4;

/**
 * Enregistre un instantane par station distincte et rend leur nombre. Un
 * lieu sans station representative, ou un echec du service, est ignore :
 * la veille ne s'interrompt jamais pour cela.
 */
export async function recordWatchSnapshots(
  entries: readonly WatchEntry[],
  now: Date,
): Promise<number> {
  const seen = new Set<string>();
  let recorded = 0;
  for (const { place } of entries.slice(0, SNAPSHOT_MAX_PLACES)) {
    try {
      const match = await stationFor(place);
      if (match === null || seen.has(match.station.id)) {
        continue;
      }
      seen.add(match.station.id);
      const series = await fetchStationPoint({
        latitude: match.station.latitude,
        longitude: match.station.longitude,
        elevation: match.station.elevation,
        models: MODEL_ORDER,
      });
      const snapshot = series.ok ? takeSnapshot(series.value, now) : null;
      if (snapshot !== null) {
        await recordSnapshot(match.station.id, snapshot, now);
        recorded += 1;
      }
    } catch {
      // Ce lieu est ignore ; les autres suivent.
    }
  }
  return recorded;
}
