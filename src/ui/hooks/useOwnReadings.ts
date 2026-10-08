import { useCallback, useState } from 'react';
import { readOwnReadings, writeOwnReadings } from '../../data/cache/ownReadingsStore';
import { removeReading, upsertReading } from '../../domain/ownReadings';
import type { OwnReading } from '../../domain/ownReadings';

export interface OwnReadingsApi {
  readonly readings: readonly OwnReading[];
  /** Ajoute la saisie, ou remplace celle du meme lieu et du meme jour. */
  readonly save: (reading: OwnReading) => void;
  readonly remove: (placeId: string, date: string) => void;
}

/** Vos mesures saisies a la main : lues une fois, ecrites a chaque changement. */
export function useOwnReadings(): OwnReadingsApi {
  const [readings, setReadings] = useState<readonly OwnReading[]>(readOwnReadings);
  const commit = useCallback((next: readonly OwnReading[]) => {
    writeOwnReadings(next);
    setReadings(next);
  }, []);
  const save = useCallback(
    (reading: OwnReading) => commit(upsertReading(readOwnReadings(), reading)),
    [commit],
  );
  const remove = useCallback(
    (placeId: string, date: string) => commit(removeReading(readOwnReadings(), placeId, date)),
    [commit],
  );
  return { readings, save, remove };
}
