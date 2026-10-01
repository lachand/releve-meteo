import type { AlertRule, Place, Preferences } from '../../domain/types';

const STORAGE_KEY = 'meteo-fr:prefs';

export function defaultPreferences(): Preferences {
  return {
    version: 1,
    favourites: [],
    units: { temperature: 'C', wind: 'kmh' },
    theme: 'auto',
    display: { quick: false },
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

const ALERT_VARIABLES: ReadonlySet<unknown> = new Set(['temperature', 'precipitation', 'wind']);

export function isAlertRule(value: unknown): value is AlertRule {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === 'string' &&
    typeof rule.placeId === 'string' &&
    ALERT_VARIABLES.has(rule.variable) &&
    (rule.comparator === 'lt' || rule.comparator === 'gt') &&
    typeof rule.threshold === 'number' &&
    Number.isFinite(rule.threshold) &&
    typeof rule.enabled === 'boolean' &&
    // Les regles enregistrees avant l'alerte d'ecart n'ont pas de `kind`.
    (rule.kind === undefined || rule.kind === 'value' || rule.kind === 'spread')
  );
}

/** Puissance crete maximale acceptee, kWc : au-dela, c'est une faute de frappe. */
export const PEAK_KWP_MAX = 100;

/** Puissance crete exploitable (arrondie au dixieme), ou null : jamais 0 ni une valeur absurde. */
export function validPeakKwp(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > PEAK_KWP_MAX) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

/** Regles lisibles seulement : une regle mal formee est ecartee, jamais evaluee. */
function normalize(preferences: Preferences): Preferences {
  const alerts: unknown = (preferences as { alerts?: unknown }).alerts;
  const solar = (preferences as { solar?: { peakKwp?: unknown } }).solar;
  return {
    ...preferences,
    // Un enregistrement d'avant la lecture rapide n'a pas de `display` : lecture complete.
    display: { quick: (preferences as { display?: { quick?: unknown } }).display?.quick === true },
    alerts: Array.isArray(alerts) ? alerts.filter(isAlertRule) : [],
    solar: { peakKwp: validPeakKwp(solar?.peakKwp) },
  };
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
    return isPreferences(parsed) ? normalize(parsed) : defaultPreferences();
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

export function setQuickReading(preferences: Preferences, quick: boolean): Preferences {
  return { ...preferences, display: { quick } };
}

export function setPeakKwp(preferences: Preferences, peakKwp: number | null): Preferences {
  return { ...preferences, solar: { peakKwp: validPeakKwp(peakKwp) } };
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

export function addAlert(preferences: Preferences, rule: AlertRule): Preferences {
  return setAlerts(preferences, [...preferences.alerts, rule]);
}

export function toggleAlert(preferences: Preferences, id: string): Preferences {
  return setAlerts(
    preferences,
    preferences.alerts.map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule)),
  );
}

export function removeAlert(preferences: Preferences, id: string): Preferences {
  return setAlerts(
    preferences,
    preferences.alerts.filter((rule) => rule.id !== id),
  );
}
