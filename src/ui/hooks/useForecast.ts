import { useEffect, useState } from 'react';
import type { ModelId, Place } from '../../domain/types';
import type { HttpFailure, HttpResult } from '../../data/clients/http';
import type { ForecastResult } from '../../data/repository';
import { getForecast } from '../../data/repository';
import { ensureStorageHeadroom } from '../../pwa/storage';

const ALL_MODELS: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];

export type ForecastState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly result: ForecastResult }
  | { readonly status: 'error'; readonly failure: HttpFailure };

interface Settled {
  readonly place: Place;
  readonly outcome: HttpResult<ForecastResult>;
}

/**
 * Recharge la prevision quand le lieu change. N'appelle jamais apres
 * demontage. "loading" est derive (aucun resultat pour le lieu courant)
 * plutot que pose par un setState synchrone en tete d'effet.
 */
export function useForecast(place: Place | null): ForecastState | null {
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (place === null) {
      return;
    }
    let cancelled = false;
    getForecast({ place, models: ALL_MODELS }).then((outcome) => {
      if (!cancelled) {
        setSettled({ place, outcome });
      }
      if (outcome.ok) {
        // Ecriture importante en cache : verifie le quota (SERVICE_WORKER.md 8).
        void ensureStorageHeadroom(Date.now());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [place]);

  if (place === null) {
    return null;
  }
  if (settled === null || settled.place !== place) {
    return { status: 'loading' };
  }
  return settled.outcome.ok
    ? { status: 'ready', result: settled.outcome.value }
    : { status: 'error', failure: settled.outcome.failure };
}
