import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readModelChoice } from '../../data/cache/modelChoice';
import { markNotified, readWatchState, saveWatchEntries } from '../../data/cache/watchStore';
import { loadDepartments, peekVerifications } from '../../data/repository';
import type { AlertHit } from '../../domain/alerts';
import { departmentAt } from '../../domain/departments';
import { MODEL_ORDER } from '../../domain/models';
import type { ModelVerification } from '../../domain/reliability';
import type { SpreadHit } from '../../domain/spreadAlerts';
import type { AlertRule, ModelId, Place, Preferences, TerrainProfile } from '../../domain/types';
import type { VigilanceSummary } from '../../domain/vigilance';
import {
  WATCH_VIGILANCE_MIN_LEVEL,
  alertKey,
  spreadKey,
  vigilanceKey,
  watchedPlaces,
} from '../../domain/watch';
import type { WatchEntry } from '../../domain/watch';
import {
  allowNotifications,
  disableWatch,
  enableCollection,
  enableWatch,
  readWatchStatus,
  requestWatchRun,
} from '../../pwa/backgroundWatch';
import type { WatchStatus } from '../../pwa/backgroundWatch';
import { WATCH_DONE_MESSAGE } from '../../pwa/watchTags';
import { terrainOf } from './useTerrain';

/*
 * Veille en arriere-plan cote page : etat reel du support, activation, et
 * recopie pour le service worker des lieux veilles avec les intrants de
 * leur cascade (le lieu ouvert avec les siens, les autres comme sur la
 * carte des favoris). Ce que la page affiche deja (alertes franchies,
 * vigilance orange) est note comme vu : la veille ne le renotifiera pas.
 */

export interface BackgroundWatch {
  /** null tant que le support n'est pas connu. */
  readonly status: WatchStatus | null;
  readonly lastRunUtcMs: number | null;
  readonly busy: boolean;
  /** Notifications et collecte : demande la permission de notifier, sur geste. */
  readonly enable: () => void;
  /** Collecte des instantanes seule, sans demander la permission de notifier. */
  readonly collect: () => void;
  /** Demande la permission de notifier sur une collecte deja active. */
  readonly allow: () => void;
  readonly disable: () => void;
}

export interface WatchMirrorInputs {
  readonly place: Place | null;
  readonly terrain: TerrainProfile | null;
  readonly verification: readonly ModelVerification[];
  readonly preferred: ModelId | null;
  readonly favourites: readonly Place[];
  readonly rules: readonly AlertRule[];
  readonly windUnit: Preferences['units']['wind'];
  readonly alertHits: readonly AlertHit[];
  readonly spreadHits: readonly SpreadHit[];
  readonly vigilance: { readonly department: string; readonly summary: VigilanceSummary } | null;
}

/** Entrees de veille recopiees pour le service worker. Exportee pour les tests. */
export async function buildWatchEntries(
  inputs: Pick<
    WatchMirrorInputs,
    'place' | 'terrain' | 'verification' | 'preferred' | 'favourites' | 'rules'
  >,
): Promise<readonly WatchEntry[]> {
  const previous = await readWatchState();
  const places = watchedPlaces({
    favourites: inputs.favourites,
    rules: inputs.rules,
    known: [
      ...(inputs.place === null ? [] : [inputs.place]),
      ...previous.entries.map((e) => e.place),
    ],
  });
  const departments = await loadDepartments();
  return Promise.all(
    places.map(async (place): Promise<WatchEntry> => {
      const found = departmentAt(place.latitude, place.longitude, departments);
      const open = inputs.place?.id === place.id;
      return {
        place,
        department: found === null ? null : { code: found.code, name: found.name },
        rules: inputs.rules.filter((rule) => rule.enabled && rule.placeId === place.id),
        terrain: open ? inputs.terrain : terrainOf(place),
        verification: open
          ? inputs.verification
          : ((await peekVerifications(place, MODEL_ORDER))?.verifications ?? []),
        preferred: open ? inputs.preferred : readModelChoice(place.id),
      };
    }),
  );
}

export function useBackgroundWatch(inputs: WatchMirrorInputs): BackgroundWatch {
  const [status, setStatus] = useState<WatchStatus | null>(null);
  const [lastRunUtcMs, setLastRun] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Premiere veille demandee a l'activation, lancee apres la recopie.
  const runAfterMirror = useRef(false);

  const refresh = useCallback(() => {
    void Promise.all([readWatchStatus(), readWatchState()]).then(([next, state]) => {
      setStatus(next);
      setLastRun(state.lastRunUtcMs);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readWatchStatus(), readWatchState()]).then(([next, state]) => {
      if (!cancelled) {
        setStatus(next);
        setLastRun(state.lastRunUtcMs);
      }
    });
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return () => {
        cancelled = true;
      };
    }
    // Le service worker signale la fin d'une veille : la date change.
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === WATCH_DONE_MESSAGE) {
        refresh();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [refresh]);

  const on = status === 'on';
  // Les lieux sont recopies des que la collecte tourne, notifications ou non.
  const active = status === 'on' || status === 'collecting';
  const { place, terrain, verification, preferred, favourites, rules, windUnit } = inputs;

  // Recopie des lieux veilles, seulement quand la veille est active.
  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    void buildWatchEntries({ place, terrain, verification, preferred, favourites, rules }).then(
      (entries) => {
        if (cancelled) {
          return;
        }
        void saveWatchEntries(entries, windUnit, new Date()).then(() => {
          if (runAfterMirror.current) {
            runAfterMirror.current = false;
            void requestWatchRun();
          }
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, place, terrain, verification, preferred, favourites, rules, windUnit]);

  // Deja montre dans la page : a ne pas notifier ensuite.
  const vigilance = inputs.vigilance;
  const seenKeys = [
    ...inputs.alertHits.map(alertKey),
    ...inputs.spreadHits.map(spreadKey),
    ...(vigilance === null
      ? []
      : vigilance.summary.warnings
          .filter((warning) => warning.level >= WATCH_VIGILANCE_MIN_LEVEL)
          .map((warning) => vigilanceKey(vigilance.department, warning))),
  ].join('\n');
  useEffect(() => {
    if (on && seenKeys !== '') {
      void markNotified(seenKeys.split('\n'), new Date());
    }
  }, [on, seenKeys]);

  const run = useCallback(
    (action: () => Promise<WatchStatus>) => {
      setBusy(true);
      void action()
        .then(setStatus)
        .finally(() => {
          setBusy(false);
          refresh();
        });
    },
    [refresh],
  );

  const enable = useCallback(
    () =>
      run(async () => {
        const next = await enableWatch();
        runAfterMirror.current = next === 'on';
        return next;
      }),
    [run],
  );
  const collect = useCallback(
    () =>
      run(async () => {
        const next = await enableCollection();
        runAfterMirror.current = next === 'on' || next === 'collecting';
        return next;
      }),
    [run],
  );
  const allow = useCallback(() => run(allowNotifications), [run]);
  const disable = useCallback(() => run(disableWatch), [run]);
  return useMemo(
    () => ({ status, lastRunUtcMs, busy, enable, collect, allow, disable }),
    [status, lastRunUtcMs, busy, enable, collect, allow, disable],
  );
}
