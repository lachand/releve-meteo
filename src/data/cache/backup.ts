import { isOwnReading } from '../../domain/ownReadings';
import type { OwnReading } from '../../domain/ownReadings';
import { isWithinMetropolitanFrance } from '../../domain/terrain';
import type { AlertRule, ModelId, Place, Preferences } from '../../domain/types';
import { normalizeNotify } from '../../domain/weatherNotices';
import type { NotifyPrefs } from '../../domain/weatherNotices';
import { isKnownModelId, readAllModelChoices, writeAllModelChoices } from './modelChoice';
import {
  defaultPreferences,
  isAlertRule,
  readPreferences,
  validPeakKwp,
  writePreferences,
} from './preferences';
import { readOwnReadings, writeOwnReadings } from './ownReadingsStore';
import { readWatchState, saveWatchDigest, saveWatchNotify } from './watchStore';

/*
 * Sauvegarde des donnees locales : favoris, alertes, reglages, choix de
 * modele et notifications voulues, dans un fichier JSON que l'utilisateur
 * garde ou transfere lui-meme (aucun serveur). Les cles d'API saisies ne sont
 * jamais exportees : ce sont des secrets de cet appareil. Le fichier lu est
 * traite comme une donnee non fiable, valide champ par champ.
 */

export const BACKUP_APP = 'releve-meteo';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  readonly app: typeof BACKUP_APP;
  readonly version: typeof BACKUP_VERSION;
  /** Instant de l'export, ISO 8601 UTC. */
  readonly exportedAt: string;
  readonly preferences: Omit<Preferences, 'apiKeys'>;
  readonly modelChoices: Readonly<Record<string, ModelId>>;
  readonly watch: { readonly digest: boolean; readonly notify: NotifyPrefs };
  /** Vos mesures saisies (Mon relevé) : rien ne peut les recalculer. */
  readonly ownReadings: readonly OwnReading[];
}

export function buildBackup(input: {
  readonly preferences: Preferences;
  readonly modelChoices: Readonly<Record<string, ModelId>>;
  readonly watch: { readonly digest: boolean; readonly notify: NotifyPrefs };
  readonly ownReadings?: readonly OwnReading[];
  readonly now: Date;
}): BackupFile {
  const { apiKeys: _secrets, ...preferences } = input.preferences;
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: input.now.toISOString(),
    preferences,
    modelChoices: input.modelChoices,
    watch: input.watch,
    ownReadings: input.ownReadings ?? [],
  };
}

export type BackupFailure = 'unreadable' | 'foreign' | 'version';

export interface ParsedBackup {
  readonly preferences: Preferences;
  readonly modelChoices: Readonly<Record<string, ModelId>>;
  readonly watch: { readonly digest: boolean; readonly notify: NotifyPrefs };
  readonly ownReadings: readonly OwnReading[];
  /** Elements du fichier ecartes parce qu'invalides (lieux, alertes, choix). */
  readonly dropped: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPlace(value: unknown): Place | null {
  const raw = record(value);
  if (
    raw === null ||
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.latitude !== 'number' ||
    typeof raw.longitude !== 'number' ||
    typeof raw.elevation !== 'number' ||
    !Number.isFinite(raw.latitude) ||
    !Number.isFinite(raw.longitude) ||
    !Number.isFinite(raw.elevation) ||
    !isWithinMetropolitanFrance(raw.latitude, raw.longitude)
  ) {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    latitude: raw.latitude,
    longitude: raw.longitude,
    elevation: raw.elevation,
    admin: typeof raw.admin === 'string' ? raw.admin : null,
    alias: typeof raw.alias === 'string' ? raw.alias : null,
  };
}

/** Lit un fichier de sauvegarde ; une valeur invalide est ecartee et comptee, jamais appliquee. */
export function parseBackup(
  text: string,
):
  | { readonly ok: true; readonly backup: ParsedBackup }
  | { readonly ok: false; readonly failure: BackupFailure } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, failure: 'unreadable' };
  }
  const file = record(raw);
  if (file === null || file.app !== BACKUP_APP) {
    return { ok: false, failure: 'foreign' };
  }
  if (file.version !== BACKUP_VERSION) {
    return { ok: false, failure: 'version' };
  }
  const prefs = record(file.preferences) ?? {};
  let dropped = 0;

  const rawFavourites = Array.isArray(prefs.favourites) ? prefs.favourites : [];
  const favourites: Place[] = [];
  for (const candidate of rawFavourites) {
    const place = readPlace(candidate);
    if (place === null || favourites.some((f) => f.id === place.id)) {
      dropped += 1;
    } else {
      favourites.push(place);
    }
  }

  const rawAlerts: unknown[] = Array.isArray(prefs.alerts) ? prefs.alerts : [];
  const alerts: AlertRule[] = rawAlerts.filter(isAlertRule);
  dropped += rawAlerts.length - alerts.length;

  const units = record(prefs.units);
  const display = record(prefs.display);
  const solar = record(prefs.solar);
  const defaults = defaultPreferences();
  const preferences: Preferences = {
    ...defaults,
    favourites,
    units: { temperature: 'C', wind: units?.wind === 'kt' ? 'kt' : 'kmh' },
    theme: prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : 'auto',
    display: { quick: display?.quick === true },
    solar: { peakKwp: validPeakKwp(solar?.peakKwp) },
    alerts,
  };

  const rawChoices = record(file.modelChoices) ?? {};
  const modelChoices: Record<string, ModelId> = {};
  for (const [placeId, model] of Object.entries(rawChoices)) {
    if (isKnownModelId(model)) {
      modelChoices[placeId] = model;
    } else {
      dropped += 1;
    }
  }

  // Un fichier d'avant Mon relevé n'a pas ce champ : la liste reste vide, sans rien ecarter.
  const rawReadings: unknown[] = Array.isArray(file.ownReadings) ? file.ownReadings : [];
  const ownReadings = rawReadings.filter(isOwnReading);
  dropped += rawReadings.length - ownReadings.length;

  const watch = record(file.watch);
  return {
    ok: true,
    backup: {
      preferences,
      modelChoices,
      watch: { digest: watch?.digest === true, notify: normalizeNotify(watch?.notify) },
      ownReadings,
      dropped,
    },
  };
}

export interface BackupSummary {
  readonly favourites: number;
  readonly alerts: number;
  readonly modelChoices: number;
  readonly ownReadings: number;
}

export function summarizeBackup(backup: ParsedBackup): BackupSummary {
  return {
    favourites: backup.preferences.favourites.length,
    alerts: backup.preferences.alerts.length,
    modelChoices: Object.keys(backup.modelChoices).length,
    ownReadings: backup.ownReadings.length,
  };
}

/** Lit l'etat local courant et en fait une sauvegarde. */
export async function collectBackup(now: Date): Promise<BackupFile> {
  const state = await readWatchState();
  return buildBackup({
    preferences: readPreferences(),
    modelChoices: readAllModelChoices(),
    watch: { digest: state.digest, notify: state.notify },
    ownReadings: readOwnReadings(),
    now,
  });
}

/**
 * Applique une sauvegarde lue : remplace favoris, alertes, reglages, choix de
 * modele et notifications voulues. Les cles d'API de cet appareil sont gardees.
 */
export async function restoreBackup(backup: ParsedBackup, now: Date): Promise<void> {
  const current = readPreferences();
  writePreferences({ ...backup.preferences, apiKeys: current.apiKeys });
  writeAllModelChoices(backup.modelChoices);
  writeOwnReadings(backup.ownReadings);
  await saveWatchDigest(backup.watch.digest, now);
  await saveWatchNotify(backup.watch.notify, now);
}
