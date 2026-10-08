import { useEffect, useMemo, useState } from 'react';
import { recordOutlook } from '../../data/cache/outlookStore';
import { driftOf, pickReference } from '../../domain/forecastDrift';
import type { DaySummary, Drift } from '../../domain/forecastDrift';

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
  summaries: readonly DaySummary[] | null,
): DriftState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = placeId === null || fetchedAt === null ? null : `${placeId}|${fetchedAt}`;
  // Le contenu des resumes, pas l'identite du tableau : l'appelant le reconstruit a chaque rendu, et
  // chaque ecriture ci-dessous change l'etat, donc relance un rendu. Dependre de l'identite bouclait
  // sans fin (une dizaine de rendus par seconde, une ecriture a chaque fois, tous les graphiques recrees).
  const content = summaries === null ? null : JSON.stringify(summaries);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- le tableau ne se renouvelle qu'avec son contenu.
  const stable = useMemo(() => summaries, [content]);

  useEffect(() => {
    if (key === null || placeId === null || fetchedAt === null || stable === null) {
      return;
    }
    let cancelled = false;
    const now = new Date();
    void recordOutlook(placeId, { issuedAt: fetchedAt, days: stable }, now).then((issues) => {
      if (cancelled) {
        return;
      }
      const reference = pickReference(issues, now);
      setSettled({
        key,
        state:
          reference === null
            ? { status: 'collecting' }
            : { status: 'ready', drift: driftOf({ current: stable, reference, now }), now },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, placeId, fetchedAt, stable]);

  if (key === null || stable === null) {
    return { status: 'idle' };
  }
  return settled?.key === key ? settled.state : { status: 'loading' };
}
