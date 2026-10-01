import { JOURNAL, isJournalEntry, mergeJournal } from '../../domain/journal';
import type { JournalEntry } from '../../domain/journal';
import { getDataset, setDataset } from './datasetStore';

/*
 * Journal des previsions (domain/journal.ts), par lieu, dans le cache de jeux
 * de donnees de l'appareil. Un seul document par lieu, ecrit a chaque bilan
 * d'hier : il ne depasse jamais JOURNAL.maxDays jours.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Le document vit un peu plus que ce qu'il contient : un lieu laisse un an d'ecart se perdre. */
const RETENTION_MS = (JOURNAL.maxDays + 30) * DAY_MS;

export async function loadJournal(placeId: string): Promise<readonly JournalEntry[]> {
  const cached = await getDataset<unknown>('journal', placeId);
  return Array.isArray(cached?.value) ? cached.value.filter(isJournalEntry) : [];
}

/** Ajoute le bilan (celui du meme jour est remplace) et rend le journal du lieu. */
export async function recordJournal(
  placeId: string,
  entry: JournalEntry,
  now: Date,
): Promise<readonly JournalEntry[]> {
  const cached = await getDataset<unknown>('journal', placeId);
  const merged = mergeJournal(cached?.value, entry);
  await setDataset('journal', placeId, merged, now.getTime(), now.getTime() + RETENTION_MS);
  return merged;
}
