import { useEffect, useState } from 'react';
import { readModelChoice } from '../../data/cache/modelChoice';
import { getForecast, peekVerifications } from '../../data/repository';
import { comparisonHours, dayDigest } from '../../domain/dayDigest';
import type { ComparisonHour, DayDigest } from '../../domain/dayDigest';
import type { BlendedPoint } from '../../domain/modelCascade';
import { MODEL_ORDER } from '../../domain/models';
import type { ForecastBundle, ModelId, Place } from '../../domain/types';
import type { ModelVerification } from '../../domain/reliability';
import { computeCascadeView } from './useCascadeView';
import { terrainOf } from './useTerrain';

/*
 * Apercu de chaque favori pour la carte « Mes lieux » : la valeur du
 * moment selon le modele que la page du lieu retiendrait, avec les memes
 * intrants (terrain, choix manuel, verification deja en cache). Aucune
 * requete de verification ici : seule la prevision est chargee, et elle
 * sert ensuite telle quelle a l'ouverture du lieu.
 */

export type FavouriteSnapshot =
  | { readonly place: Place; readonly status: 'loading' }
  | { readonly place: Place; readonly status: 'error' }
  | {
      readonly place: Place;
      readonly status: 'ready';
      /** Modele retenu a l'instant present, ou null si aucun ne le couvre. */
      readonly model: ModelId | null;
      readonly point: BlendedPoint | null;
      readonly manual: boolean;
      /** 24 prochaines heures, pour comparer les lieux ; null sans heure a venir. */
      readonly digest: DayDigest | null;
      /** 48 prochaines heures selon le modele retenu, pour tracer deux lieux ensemble. */
      readonly hours: readonly ComparisonHour[];
    };

/** Valeur du moment d'un favori, pure : exportee pour les tests. */
export function snapshotOf(input: {
  readonly place: Place;
  readonly bundle: ForecastBundle;
  readonly verification: readonly ModelVerification[];
  readonly preferred: ModelId | null;
  readonly now: Date;
}): FavouriteSnapshot {
  const view = computeCascadeView(
    input.bundle,
    {
      terrain: terrainOf(input.bundle.place),
      verification: input.verification,
      preferred: input.preferred,
    },
    input.now,
  );
  const points = view.points.filter((p) => p !== null);
  const point = view.nowIndex === -1 ? null : (view.points[view.nowIndex] ?? null);
  return {
    place: input.place,
    status: 'ready',
    model: point?.model ?? null,
    point,
    manual: input.preferred !== null && input.preferred === point?.model,
    digest: dayDigest({ points, now: input.now }),
    hours: comparisonHours({ points, now: input.now }),
  };
}

async function loadSnapshot(place: Place): Promise<FavouriteSnapshot> {
  const [forecast, verification] = await Promise.all([
    getForecast({ place, models: MODEL_ORDER }),
    peekVerifications(place, MODEL_ORDER),
  ]);
  if (!forecast.ok) {
    return { place, status: 'error' };
  }
  return snapshotOf({
    place,
    bundle: forecast.value.bundle,
    verification: verification?.verifications ?? [],
    preferred: readModelChoice(place.id),
    now: new Date(),
  });
}

/** Apercus des favoris, completes au fil des reponses. */
export function useFavouriteSnapshots(favourites: readonly Place[]): readonly FavouriteSnapshot[] {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, FavouriteSnapshot>>(new Map());

  useEffect(() => {
    let cancelled = false;
    for (const place of favourites) {
      void loadSnapshot(place).then((snapshot) => {
        if (!cancelled) {
          setLoaded((previous) => new Map(previous).set(place.id, snapshot));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [favourites]);

  return favourites.map(
    (place): FavouriteSnapshot => loaded.get(place.id) ?? { place, status: 'loading' },
  );
}
