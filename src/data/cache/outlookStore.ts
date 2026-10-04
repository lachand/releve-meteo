import { DRIFT, isOutlookIssue, mergeOutlooks } from '../../domain/forecastDrift';
import type { OutlookIssue } from '../../domain/forecastDrift';
import { getDataset, setDataset } from './datasetStore';

/*
 * Previsions gardees (domain/forecastDrift.ts), par lieu, dans le cache de
 * jeux de donnees de l'appareil. Un seul document par lieu, purge a chaque
 * ecriture : il ne depasse jamais la retention.
 */

const HOUR_MS = 60 * 60 * 1000;
const RETENTION_MS = DRIFT.retentionHours * HOUR_MS;

export async function loadOutlooks(placeId: string): Promise<readonly OutlookIssue[]> {
  const cached = await getDataset<unknown>('outlooks', placeId);
  return Array.isArray(cached?.value) ? cached.value.filter(isOutlookIssue) : [];
}

/** Ajoute la prevision lue (celle de la meme heure d'emission est remplacee) et rend celles du lieu. */
export async function recordOutlook(
  placeId: string,
  issue: OutlookIssue,
  now: Date,
): Promise<readonly OutlookIssue[]> {
  const cached = await getDataset<unknown>('outlooks', placeId);
  const merged = mergeOutlooks(cached?.value, issue, now);
  await setDataset('outlooks', placeId, merged, now.getTime(), now.getTime() + RETENTION_MS);
  return merged;
}
