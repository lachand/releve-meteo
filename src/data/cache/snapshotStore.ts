import { SHORT_LEADS, mergeSnapshots } from '../../domain/leadScores';
import type { ForecastSnapshot } from '../../domain/leadScores';
import { getDataset, setDataset } from './datasetStore';

/*
 * Instantanes de prevision horaires (domain/leadScores.ts), par station,
 * dans le cache de jeux de donnees. Un seul document par station, purge a
 * chaque ecriture : il ne grossit jamais au-dela de la retention.
 */

const RETENTION_MS = SHORT_LEADS.retentionHours * 60 * 60 * 1000;

export async function loadSnapshots(stationId: string): Promise<ForecastSnapshot[]> {
  const cached = await getDataset<unknown>('snapshots', stationId);
  return Array.isArray(cached?.value) ? (cached.value as ForecastSnapshot[]) : [];
}

/** Ajoute l'instantane (celui de la meme heure est remplace) et rend tous ceux qui restent. */
export async function recordSnapshot(
  stationId: string,
  snapshot: ForecastSnapshot,
  now: Date,
): Promise<ForecastSnapshot[]> {
  const merged = mergeSnapshots(await loadSnapshots(stationId), [snapshot], now);
  await setDataset('snapshots', stationId, merged, now.getTime(), now.getTime() + RETENTION_MS);
  return merged;
}
