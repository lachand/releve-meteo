import { fetchVigilance } from '../data/clients/vigilance';
import { readWatchState } from '../data/cache/watchStore';
import { summarizeVigilance } from '../domain/vigilance';
import type { VigilanceWarning } from '../domain/vigilance';
import type { Place } from '../domain/types';
import type { WatchEntry } from '../domain/watch';
import { loadEntryForecast } from '../pwa/watchRun';
import { WIDGET_MAX_PLACES, widgetPayload } from './payload';
import type { WidgetPayload } from './payload';

/*
 * Calcul du widget : les lieux veilles que la page a recopies dans IndexedDB
 * (meme origine, donc meme stockage dans l'application Android), la meme
 * prevision rechargee et la meme cascade que la page, puis un contenu de
 * widget. Sans lieu recopie, un lieu passe en parametre peut servir (premiere
 * ouverture, essais).
 */

/** Lieu explicite de l'adresse (`lat`, `lon`, `nom`), ou null. */
export function placeFromSearch(search: string): Place | null {
  const params = new URLSearchParams(search);
  const latitude = Number(params.get('lat'));
  const longitude = Number(params.get('lon'));
  if (
    params.get('lat') === null ||
    params.get('lon') === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return {
    id: `${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    name: params.get('nom') ?? 'Lieu',
    latitude,
    longitude,
    elevation: Number(params.get('alt') ?? 0),
    admin: '',
    alias: null,
  };
}

function entryFor(place: Place): WatchEntry {
  return {
    place,
    department: null,
    rules: [],
    terrain: null,
    verification: [],
    preferred: null,
  };
}

/** Un bulletin par departement et par calcul, meme pour plusieurs lieux ; un bulletin illisible ou perime ne dit rien. */
async function warningsOf(
  entry: WatchEntry,
  now: Date,
  bulletins: Map<string, Promise<readonly VigilanceWarning[]>>,
): Promise<readonly VigilanceWarning[]> {
  const department = entry.department;
  if (department === null) {
    return [];
  }
  let pending = bulletins.get(department.code);
  if (pending === undefined) {
    pending = fetchVigilance(department.code).then((result) => {
      if (!result.ok) {
        return [];
      }
      const summary = summarizeVigilance(result.value, now);
      return summary.stale ? [] : summary.warnings;
    });
    bulletins.set(department.code, pending);
  }
  return pending;
}

export async function runWidget(search: string, now: Date): Promise<WidgetPayload> {
  const state = await readWatchState();
  const fallback = placeFromSearch(search);
  const entries = (
    state.entries.length > 0 || fallback === null ? state.entries : [entryFor(fallback)]
  ).slice(0, WIDGET_MAX_PLACES);
  const bulletins = new Map<string, Promise<readonly VigilanceWarning[]>>();
  const [forecasts, vigilances] = await Promise.all([
    Promise.all(entries.map((entry) => loadEntryForecast(entry, now))),
    Promise.all(entries.map((entry) => warningsOf(entry, now, bulletins))),
  ]);
  return widgetPayload({ entries, forecasts, now, windUnit: state.windUnit, vigilances });
}
