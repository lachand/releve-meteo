import { useEffect, useState } from 'react';
import type { Place } from '../../domain/types';
import type { HttpFailure, HttpResult } from '../../data/clients/http';
import { searchPlaces } from '../../data/repository';

export type PlaceSearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly places: readonly Place[] }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly failure: HttpFailure };

interface Settled {
  readonly query: string;
  readonly outcome: HttpResult<readonly Place[]>;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

/**
 * Recherche debattue : n'interroge l'API qu'apres une pause de saisie.
 * "loading" est derive (aucun resultat pour la requete courante) plutot
 * que pose par un setState synchrone en tete d'effet.
 */
export function usePlaceSearch(query: string): PlaceSearchState {
  const trimmed = query.trim();
  const tooShort = trimmed.length < MIN_QUERY_LENGTH;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (tooShort) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchPlaces(trimmed).then((outcome) => {
        if (!cancelled) {
          setSettled({ query: trimmed, outcome });
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, tooShort]);

  if (tooShort) {
    return { status: 'idle' };
  }
  if (settled === null || settled.query !== trimmed) {
    return { status: 'loading' };
  }
  if (!settled.outcome.ok) {
    return { status: 'error', failure: settled.outcome.failure };
  }
  return settled.outcome.value.length === 0
    ? { status: 'empty' }
    : { status: 'ready', places: settled.outcome.value };
}
