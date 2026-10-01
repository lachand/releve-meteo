import { readWatchState } from '../data/cache/watchStore';
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

export async function runWidget(search: string, now: Date): Promise<WidgetPayload> {
  const state = await readWatchState();
  const fallback = placeFromSearch(search);
  const entries = (
    state.entries.length > 0 || fallback === null ? state.entries : [entryFor(fallback)]
  ).slice(0, WIDGET_MAX_PLACES);
  const forecasts = await Promise.all(entries.map((entry) => loadEntryForecast(entry, now)));
  return widgetPayload({ entries, forecasts, now });
}
