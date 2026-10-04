import {
  CALIBRATION,
  calibrationRecordFrom,
  isCalibrationRecord,
  mergeCalibration,
} from '../../domain/calibration';
import type { CalibrationRecord } from '../../domain/calibration';
import type { JournalEntry } from '../../domain/journal';
import { getDataset, setDataset } from './datasetStore';
import { loadOutlooks } from './outlookStore';

/*
 * Confiance dite contre erreur mesuree (domain/calibration.ts), par lieu, dans
 * le cache de jeux de donnees. Un enregistrement par jour verifie, ecrit
 * quand le jour entre au journal : le document ne depasse jamais maxDays jours.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = (CALIBRATION.maxDays + 30) * DAY_MS;

export async function loadCalibration(placeId: string): Promise<readonly CalibrationRecord[]> {
  const cached = await getDataset<unknown>('calibration', placeId);
  return Array.isArray(cached?.value) ? cached.value.filter(isCalibrationRecord) : [];
}

/**
 * Rapproche le jour du journal de la prevision gardee la veille et de la
 * confiance qu'elle portait. Sans prevision gardee a la bonne echeance, rien
 * n'est enregistre : jamais une confiance devinee apres coup.
 */
export async function recordCalibration(
  placeId: string,
  entry: JournalEntry,
  now: Date,
): Promise<readonly CalibrationRecord[]> {
  const record = calibrationRecordFrom({ entry, issues: await loadOutlooks(placeId) });
  if (record === null) {
    return loadCalibration(placeId);
  }
  const cached = await getDataset<unknown>('calibration', placeId);
  const merged = mergeCalibration(cached?.value, record);
  await setDataset('calibration', placeId, merged, now.getTime(), now.getTime() + RETENTION_MS);
  return merged;
}
