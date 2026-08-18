import type { AlertRule, Place, Preferences } from '../../domain/types';

const STORAGE_KEY = 'meteo-fr:prefs';

export function defaultPreferences(): Preferences {
  return {
    version: 1,
    favourites: [],
    units: { temperature: 'C', wind: 'kmh' },
    theme: 'auto',
    solar: { peakKwp: null },
    apiKeys: { vigilance: null, infoclimat: null },
    alerts: [],
  };
}

// Repli en memoire : localStorage indisponible (mode prive strict) ou lecture
// deja tombee sur des defauts a cause d'un JSON corrompu ou d'une version
// inconnue, cf. ARCHITECTURE.md section 4.6.
let memoryFallback: Preferences | null = null;

function isPreferences(value: unknown): value is Preferences {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    Array.isArray((value as { favourites?: unknown }).favourites)
  );
}

export function readPreferences(): Preferences {
  if (memoryFallback !== null) {
    return memoryFallback;
  }
  if (typeof localStorage === 'undefined') {
    return defaultPreferences();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return defaultPreferences();
    }
    const parsed: unknown = JSON.parse(raw);
    return isPreferences(parsed) ? parsed : defaultPreferences();
  } catch {
    return defaultPreferences();
  }
}

export function writePreferences(preferences: Preferences): void {
  if (typeof localStorage === 'undefined') {
    memoryFallback = preferences;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    memoryFallback = null;
  } catch {
    memoryFallback = preferences;
  }
}

/** Reinitialise le repli memoire. Utilise par les tests. */
export function resetMemoryPreferencesForTests(): void {
  memoryFallback = null;
}

export interface AddFavouriteResult {
  readonly preferences: Preferences;
  readonly wasFirstFavourite: boolean;
}

/** Idempotent : ajouter un lieu deja favori le laisse a sa place. */
export function addFavourite(preferences: Preferences, place: Place): AddFavouriteResult {
  if (preferences.favourites.some((favourite) => favourite.id === place.id)) {
    return { preferences, wasFirstFavourite: false };
  }
  return {
    preferences: { ...preferences, favourites: [...preferences.favourites, place] },
    wasFirstFavourite: preferences.favourites.length === 0,
  };
}

export function removeFavourite(preferences: Preferences, placeId: string): Preferences {
  return {
    ...preferences,
    favourites: preferences.favourites.filter((favourite) => favourite.id !== placeId),
  };
}

/** `orderedIds` porte l'ordre voulu en entier ; tout id inconnu est ignore. */
export function reorderFavourites(
  preferences: Preferences,
  orderedIds: readonly string[],
): Preferences {
  const byId = new Map(preferences.favourites.map((favourite) => [favourite.id, favourite]));
  const reordered = orderedIds
    .map((id) => byId.get(id))
    .filter((favourite): favourite is Place => favourite !== undefined);
  return { ...preferences, favourites: reordered };
}

export function setAlias(
  preferences: Preferences,
  placeId: string,
  alias: string | null,
): Preferences {
  return {
    ...preferences,
    favourites: preferences.favourites.map((favourite) =>
      favourite.id === placeId ? { ...favourite, alias } : favourite,
    ),
  };
}

export function setWindUnit(preferences: Preferences, wind: 'kmh' | 'kt'): Preferences {
  return { ...preferences, units: { ...preferences.units, wind } };
}

export function setTheme(preferences: Preferences, theme: Preferences['theme']): Preferences {
  return { ...preferences, theme };
}

export function setApiKey(
  preferences: Preferences,
  kind: keyof Preferences['apiKeys'],
  key: string | null,
): Preferences {
  return { ...preferences, apiKeys: { ...preferences.apiKeys, [kind]: key } };
}

export function setAlerts(preferences: Preferences, alerts: readonly AlertRule[]): Preferences {
  return { ...preferences, alerts };
}
