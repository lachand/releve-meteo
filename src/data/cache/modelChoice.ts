import type { ModelId } from '../../domain/types';

/*
 * Choix manuel du modele de reference, par lieu (ROADMAP.md A4). Stocke a
 * part des preferences versionnees : une cle absente ou illisible vaut
 * « selection automatique », jamais une erreur.
 */

const STORAGE_KEY = 'meteo-fr:model-choice';

const MODEL_IDS: ReadonlySet<string> = new Set([
  'arome',
  'arome_france',
  'icon_d2',
  'arpege',
  'icon_eu',
  'ecmwf',
  'gfs',
]);

let memory: Record<string, ModelId> = {};

function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && MODEL_IDS.has(value);
}

function readAll(): Record<string, ModelId> {
  if (typeof localStorage === 'undefined') {
    return { ...memory };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const result: Record<string, ModelId> = {};
    for (const [placeId, model] of Object.entries(parsed)) {
      if (isModelId(model)) {
        result[placeId] = model;
      }
    }
    return result;
  } catch {
    return { ...memory };
  }
}

function writeAll(choices: Record<string, ModelId>): void {
  memory = { ...choices };
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // Quota ou mode prive : le repli memoire suffit pour la session.
  }
}

/** Modele choisi pour ce lieu, ou null (selection automatique). */
export function readModelChoice(placeId: string): ModelId | null {
  return readAll()[placeId] ?? null;
}

/** null revient a la selection automatique. */
export function writeModelChoice(placeId: string, model: ModelId | null): void {
  const all = readAll();
  if (model === null) {
    delete all[placeId];
  } else {
    all[placeId] = model;
  }
  writeAll(all);
}

/** Efface tous les choix. Utilise par la purge des donnees locales et les tests. */
export function clearModelChoices(): void {
  memory = {};
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien a faire : le repli memoire est deja vide.
  }
}
