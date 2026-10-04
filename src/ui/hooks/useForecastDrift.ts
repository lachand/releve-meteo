import { useEffect, useMemo, useState } from 'react';
import { recordOutlook } from '../../data/cache/outlookStore';
import { driftOf, pickReference, summarizeDays } from '../../domain/forecastDrift';
import type { Drift } from '../../domain/forecastDrift';
import type { BlendedDay } from '../../domain/dailyBlend';

/**
 * Ce que la prevision a change depuis la veille : « idle » sans prevision,
 * « loading » le temps de lire la memoire de l'appareil, « collecting » quand
 * aucune prevision n'a ete gardee vers 24 h avant, « ready » avec l'ecart.
 */
export type DriftState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'collecting' }
  | { readonly status: 'ready'; readonly drift: Drift; readonly now: Date };

interface Settled {
  readonly key: string;
  readonly state: DriftState;
}

/**
 * Garde la prevision lue (une par heure et par lieu) et la compare a celle
 * d'hier. `fetchedAt` est l'instant de la lecture de la prevision : une
 * prevision relue du cache hors ligne garde sa vraie heure.
 */
export function useForecastDrift(
  placeId: string | null,
  fetchedAt: number | null,
  days: readonly BlendedDay[] | null,
): DriftState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const summaries = useMemo(() => (days === null ? null : summarizeDays(days)), [days]);
  const key = placeId === null || fetchedAt === null ? null : `${placeId}|${fetchedAt}`;

  useEffect(() => {
    if (key === null || placeId === null || fetchedAt === null || summaries === null) {
      return;
    }
    let cancelled = false;
    const now = new Date();
    void recordOutlook(placeId, { issuedAt: fetchedAt, days: summaries }, now).then((issues) => {
      if (cancelled) {
        return;
      }
      const reference = pickReference(issues, now);
      setSettled({
        key,
        state:
          reference === null
            ? { status: 'collecting' }
            : { status: 'ready', drift: driftOf({ current: summaries, reference, now }), now },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, placeId, fetchedAt, summaries]);

  if (key === null || summaries === null) {
    return { status: 'idle' };
  }
  return settled?.key === key ? settled.state : { status: 'loading' };
}
