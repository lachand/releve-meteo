import { useEffect, useState } from 'react';
import type { HttpFailure, HttpResult } from '../../data/clients/http';
import type { DatasetResult } from '../../data/repository';

export type DatasetState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly value: T;
      readonly fetchedAt: number;
      readonly stale: boolean;
    }
  | { readonly status: 'error'; readonly failure: HttpFailure };

interface Settled<T> {
  readonly key: string;
  readonly outcome: HttpResult<DatasetResult<T>>;
}

/**
 * Charge un jeu de donnees secondaire (ensemble, verification, qualite de
 * l'air, nowcast) identifie par `key`. `key` a null : rien a charger
 * (etat 'idle'). « loading » est derive (aucun resultat pour la cle
 * courante), jamais pose par un setState synchrone en tete d'effet.
 */
export function useDataset<T>(
  key: string | null,
  loader: () => Promise<HttpResult<DatasetResult<T>>>,
): DatasetState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    if (key === null) {
      return;
    }
    let cancelled = false;
    void loader().then((outcome) => {
      if (!cancelled) {
        setSettled({ key, outcome });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- le chargeur est recree a chaque rendu ; seule la cle identifie le jeu a charger.
  }, [key]);

  if (key === null) {
    return { status: 'idle' };
  }
  if (settled === null || settled.key !== key) {
    return { status: 'loading' };
  }
  const { outcome } = settled;
  return outcome.ok
    ? {
        status: 'ready',
        value: outcome.value.value,
        fetchedAt: outcome.value.fetchedAt,
        stale: outcome.value.stale,
      }
    : { status: 'error', failure: outcome.failure };
}
