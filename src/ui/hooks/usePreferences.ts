import { useCallback, useState } from 'react';
import { clearAllLocalData } from '../../data/cache/db';
import { clearModelChoices } from '../../data/cache/modelChoice';
import {
  addAlert as addAlertToPrefs,
  addFavourite as addFavouriteToPrefs,
  defaultPreferences,
  readPreferences,
  removeAlert as removeAlertFromPrefs,
  removeFavourite as removeFavouriteFromPrefs,
  reorderFavourites as reorderFavouritesInPrefs,
  setAlias as setAliasInPrefs,
  setTheme as setThemeInPrefs,
  setWindUnit as setWindUnitInPrefs,
  toggleAlert as toggleAlertInPrefs,
  writePreferences,
} from '../../data/cache/preferences';
import type { AlertRule, Place, Preferences } from '../../domain/types';
import { requestPersistentStorageOnce } from '../../pwa/storage';

export interface PreferencesApi {
  readonly preferences: Preferences;
  readonly addFavourite: (place: Place) => void;
  readonly removeFavourite: (placeId: string) => void;
  readonly reorderFavourites: (orderedIds: readonly string[]) => void;
  readonly setAlias: (placeId: string, alias: string | null) => void;
  readonly setWindUnit: (wind: 'kmh' | 'kt') => void;
  readonly setTheme: (theme: Preferences['theme']) => void;
  readonly addAlert: (rule: Omit<AlertRule, 'id'>) => void;
  readonly toggleAlert: (id: string) => void;
  readonly removeAlert: (id: string) => void;
  readonly purgeLocalData: () => Promise<void>;
}

/** Identifiant de regle : unique sur l'appareil, sans dependance. */
function newAlertId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Facade React sur `data/cache/preferences.ts` : lit une fois au montage,
 * puis tient l'etat en memoire et le reecrit a chaque mutation. Ferme
 * l'ecart de IMPLEMENTATION_PLAN.md section 3 point 2 : `persist()` n'est
 * demande qu'au moment ou le tout premier favori est reellement enregistre.
 */
export function usePreferences(): PreferencesApi {
  const [preferences, setPreferences] = useState<Preferences>(() => readPreferences());

  const addFavourite = useCallback((place: Place) => {
    setPreferences((current) => {
      const { preferences: next, wasFirstFavourite } = addFavouriteToPrefs(current, place);
      writePreferences(next);
      if (wasFirstFavourite) {
        void requestPersistentStorageOnce();
      }
      return next;
    });
  }, []);

  const removeFavourite = useCallback((placeId: string) => {
    setPreferences((current) => {
      const next = removeFavouriteFromPrefs(current, placeId);
      writePreferences(next);
      return next;
    });
  }, []);

  const reorderFavourites = useCallback((orderedIds: readonly string[]) => {
    setPreferences((current) => {
      const next = reorderFavouritesInPrefs(current, orderedIds);
      writePreferences(next);
      return next;
    });
  }, []);

  const setAlias = useCallback((placeId: string, alias: string | null) => {
    setPreferences((current) => {
      const next = setAliasInPrefs(current, placeId, alias);
      writePreferences(next);
      return next;
    });
  }, []);

  const setWindUnit = useCallback((wind: 'kmh' | 'kt') => {
    setPreferences((current) => {
      const next = setWindUnitInPrefs(current, wind);
      writePreferences(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: Preferences['theme']) => {
    setPreferences((current) => {
      const next = setThemeInPrefs(current, theme);
      writePreferences(next);
      return next;
    });
  }, []);

  const update = useCallback((change: (current: Preferences) => Preferences) => {
    setPreferences((current) => {
      const next = change(current);
      writePreferences(next);
      return next;
    });
  }, []);

  const addAlert = useCallback(
    (rule: Omit<AlertRule, 'id'>) =>
      update((current) => addAlertToPrefs(current, { ...rule, id: newAlertId() })),
    [update],
  );
  const toggleAlert = useCallback(
    (id: string) => update((current) => toggleAlertInPrefs(current, id)),
    [update],
  );
  const removeAlert = useCallback(
    (id: string) => update((current) => removeAlertFromPrefs(current, id)),
    [update],
  );

  const purgeLocalData = useCallback(async () => {
    await clearAllLocalData();
    clearModelChoices();
    const defaults = defaultPreferences();
    writePreferences(defaults);
    setPreferences(defaults);
  }, []);

  return {
    preferences,
    addFavourite,
    removeFavourite,
    reorderFavourites,
    setAlias,
    setWindUnit,
    setTheme,
    addAlert,
    toggleAlert,
    removeAlert,
    purgeLocalData,
  };
}
