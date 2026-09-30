import { CACHE_TTL_MS } from '../domain/constants';
import { departmentAt } from '../domain/departments';
import type { Department } from '../domain/departments';
import type { EnsembleHourly } from '../domain/ensemble';
import { FORECAST_GRID, gridPoints } from '../domain/grid';
import type { ForecastGrid } from '../domain/grid';
import { takeSnapshot } from '../domain/leadScores';
import type { ForecastSnapshot } from '../domain/leadScores';
import type { StationModelSeries, StationRecord } from '../domain/stationCheck';
import { nearestStation } from '../domain/stations';
import type { Station, StationMatch } from '../domain/stations';
import type { ForecastBundle, ModelId, Place } from '../domain/types';
import type { VigilanceBulletin } from '../domain/vigilance';
import { fetchAirQuality } from './clients/airQuality';
import type { AirQualitySeries } from './clients/airQuality';
import { fetchEnsemble } from './clients/ensemble';
import { fetchForecastGrid } from './clients/forecastGrid';
import { fetchPlaces } from './clients/geocoding';
import { request } from './clients/http';
import type { HttpResult } from './clients/http';
import { fetchStationYear, parseStationRecords } from './clients/meteostat';
import {
  fetchForecast,
  fetchNowcast,
  fetchStationPoint,
  fetchStationPreviousDay,
} from './clients/openMeteo';
import { fetchVerifications } from './clients/verification';
import { fetchVigilance } from './clients/vigilance';
import type { VerificationReport } from './clients/verification';
import { getDataset, setDataset } from './cache/datasetStore';
import type { DatasetKind } from './cache/datasetStore';
import { getCachedPlaces, normalizeQuery, setCachedPlaces } from './cache/geocodingStore';
import { getCachedForecast, setCachedForecast } from './cache/forecastStore';
import { loadSnapshots, recordSnapshot } from './cache/snapshotStore';
import { mapNowcast } from './mappers/nowcastMapper';
import type { Nowcast } from './mappers/nowcastMapper';
import { mapOpenMeteoResponse } from './mappers/openMeteoMapper';
import { enqueue } from './queue';

export interface ForecastRequest {
  readonly place: Place;
  readonly models: readonly ModelId[];
  readonly forceRefresh?: boolean;
}

export interface ForecastResult {
  readonly bundle: ForecastBundle;
  readonly fromCache: boolean;
  readonly stale: boolean; // servi hors ligne au dela du TTL
  readonly missingModels: readonly ModelId[];
}

/**
 * Un jour passe : les 24 dernieres heures s'affichent en 'estimated',
 * pour situer la prevision par rapport a ce qui vient de se passer.
 * Dix jours de deterministe : ECMWF et GFS portent la fin de la cascade,
 * l'ensemble ECMWF (15 jours) prend le relais dans la vue longue.
 */
export const PAST_DAYS = 1;
export const FORECAST_DAYS = 10;

function missingModelsOf(request: ForecastRequest, bundle: ForecastBundle): readonly ModelId[] {
  return request.models.filter((model) => bundle.series[model] === undefined);
}

export async function getForecast(request: ForecastRequest): Promise<HttpResult<ForecastResult>> {
  const cacheKey = {
    placeId: request.place.id,
    models: request.models,
    pastDays: PAST_DAYS,
    forecastDays: FORECAST_DAYS,
  };
  const now = Date.now();
  const cached = await getCachedForecast(cacheKey);

  if (!request.forceRefresh && cached !== null && cached.expiresAt > now) {
    return {
      ok: true,
      value: {
        bundle: cached.bundle,
        fromCache: true,
        stale: false,
        missingModels: missingModelsOf(request, cached.bundle),
      },
    };
  }

  const queueKey = `forecast:${cacheKey.placeId}|${[...cacheKey.models].sort().join(',')}|${cacheKey.pastDays}|${cacheKey.forecastDays}`;
  return enqueue(queueKey, async () => {
    const response = await fetchForecast({
      latitude: request.place.latitude,
      longitude: request.place.longitude,
      models: request.models,
      pastDays: PAST_DAYS,
      forecastDays: FORECAST_DAYS,
    });

    if (!response.ok) {
      if (cached !== null) {
        return {
          ok: true,
          value: {
            bundle: cached.bundle,
            fromCache: true,
            stale: true,
            missingModels: missingModelsOf(request, cached.bundle),
          },
        } satisfies HttpResult<ForecastResult>;
      }
      return response;
    }

    const mapped = mapOpenMeteoResponse({
      place: request.place,
      requestedModels: request.models,
      response: response.value,
      now: new Date(now),
      fetchedAt: now,
    });
    if (!mapped.ok) {
      return mapped;
    }

    await setCachedForecast(cacheKey, mapped.value.bundle, now, now + CACHE_TTL_MS.forecast);
    return {
      ok: true,
      value: {
        bundle: mapped.value.bundle,
        fromCache: false,
        stale: false,
        missingModels: mapped.value.missingModels,
      },
    } satisfies HttpResult<ForecastResult>;
  });
}

export async function searchPlaces(query: string): Promise<HttpResult<readonly Place[]>> {
  const now = Date.now();
  const cached = await getCachedPlaces(query);
  if (cached !== null && cached.expiresAt > now) {
    return { ok: true, value: cached.places };
  }

  return enqueue(`geocoding:${normalizeQuery(query)}`, async () => {
    const result = await fetchPlaces({ query });
    if (result.ok) {
      await setCachedPlaces(query, result.value, now, now + CACHE_TTL_MS.geocoding);
    }
    return result;
  });
}

/** Resultat d'un jeu de donnees secondaire, avec son horodatage. */
export interface DatasetResult<T> {
  readonly value: T;
  readonly fetchedAt: number;
  readonly stale: boolean;
}

/**
 * Lecture a travers le cache generique : frais -> cache ; sinon reseau ;
 * reseau en echec -> copie perimee si elle existe (stale), sinon l'echec.
 */
async function throughCache<T>(input: {
  readonly kind: DatasetKind;
  readonly placeId: string;
  readonly ttlMs: number;
  readonly fetcher: () => Promise<HttpResult<T>>;
}): Promise<HttpResult<DatasetResult<T>>> {
  const now = Date.now();
  const cached = await getDataset<T>(input.kind, input.placeId);
  if (cached !== null && cached.expiresAt > now) {
    return { ok: true, value: { value: cached.value, fetchedAt: cached.storedAt, stale: false } };
  }
  return enqueue(`${input.kind}:${input.placeId}`, async () => {
    const result = await input.fetcher();
    if (!result.ok) {
      if (cached !== null) {
        return {
          ok: true,
          value: { value: cached.value, fetchedAt: cached.storedAt, stale: true },
        } satisfies HttpResult<DatasetResult<T>>;
      }
      return result;
    }
    await setDataset(input.kind, input.placeId, result.value, now, now + input.ttlMs);
    return {
      ok: true,
      value: { value: result.value, fetchedAt: now, stale: false },
    } satisfies HttpResult<DatasetResult<T>>;
  });
}

export function getEnsemble(place: Place): Promise<HttpResult<DatasetResult<EnsembleHourly>>> {
  return throughCache({
    kind: 'ensemble',
    placeId: place.id,
    ttlMs: CACHE_TTL_MS.ensemble,
    fetcher: () => fetchEnsemble(place.latitude, place.longitude),
  });
}

let stationsPromise: Promise<readonly Station[]> | null = null;

/**
 * Stations d'observation de France metropolitaine, liste statique generee
 * par `scripts/generate-stations.py` et servie avec l'application (donc
 * disponible hors ligne). Liste vide si le fichier manque : la
 * verification se replie alors sur la reanalyse.
 */
export function loadStations(): Promise<readonly Station[]> {
  stationsPromise ??= request<readonly Station[]>('/data/stations-fr.json', { retries: 0 }).then(
    (result) => (result.ok && Array.isArray(result.value) ? result.value : []),
  );
  return stationsPromise;
}

/** Reinitialise la liste memorisee. Utilise par les tests. */
export function resetStationsForTests(): void {
  stationsPromise = null;
}

/** Station representative du lieu (distance et denivele bornes), ou null. */
async function stationFor(place: Place): Promise<StationMatch | null> {
  return nearestStation({
    latitude: place.latitude,
    longitude: place.longitude,
    elevation: place.elevation,
    stations: await loadStations(),
  });
}

export async function getVerifications(
  place: Place,
  models: readonly ModelId[],
): Promise<HttpResult<DatasetResult<VerificationReport>>> {
  const station = await stationFor(place);
  return throughCache({
    kind: 'verification',
    placeId: `${place.id}|${[...models].sort().join(',')}`,
    ttlMs: CACHE_TTL_MS.verification,
    fetcher: () =>
      fetchVerifications({
        latitude: place.latitude,
        longitude: place.longitude,
        models,
        station,
        now: new Date(),
      }),
  });
}

/**
 * Verification deja en cache pour ce lieu, meme perimee, sans jamais
 * interroger le reseau : pour les apercus (carte des favoris), ou une
 * erreur mesuree la semaine passee vaut mieux que pas d'erreur du tout.
 */
export async function peekVerifications(
  place: Place,
  models: readonly ModelId[],
): Promise<VerificationReport | null> {
  const cached = await getDataset<VerificationReport>(
    'verification',
    `${place.id}|${[...models].sort().join(',')}`,
  );
  return cached?.value ?? null;
}

export function getAirQuality(place: Place): Promise<HttpResult<DatasetResult<AirQualitySeries>>> {
  return throughCache({
    kind: 'airQuality',
    placeId: place.id,
    ttlMs: CACHE_TTL_MS.airQuality,
    fetcher: () => fetchAirQuality(place.latitude, place.longitude),
  });
}

export function getNowcast(place: Place): Promise<HttpResult<DatasetResult<Nowcast>>> {
  return throughCache({
    kind: 'nowcast',
    placeId: place.id,
    ttlMs: CACHE_TTL_MS.nowcast,
    fetcher: async () => {
      const result = await fetchNowcast(place.latitude, place.longitude);
      return result.ok ? mapNowcast(result.value) : result;
    },
  });
}

/** Releves recents de la station representative du lieu. */
export interface StationReport {
  /** null : aucune station ne represente ce lieu. */
  readonly match: StationMatch | null;
  readonly records: readonly StationRecord[];
  /**
   * Temperatures des modeles au point et a l'altitude de la station, pour
   * une comparaison station a station ; null si indisponibles.
   */
  readonly models: StationModelSeries | null;
  /**
   * Temperatures prevues la veille (`previous_day1`) au meme point, avant-hier
   * et hier, pour « hier, prevu contre reel » ; null si indisponibles.
   */
  readonly previousDay: StationModelSeries | null;
  /**
   * Instantanes horaires enregistres par l'application pour cette station
   * (echeances de 1 a 12 h), du plus ancien au plus recent. Vide tant que
   * rien n'a ete collecte.
   */
  readonly snapshots: readonly ForecastSnapshot[];
}

/**
 * Profondeur du releve, heures : de quoi calculer l'ecart recent meme
 * quand la station publie avec retard ou se tait la nuit, et couvrir
 * la journee d'hier entiere (jusqu'a 49 h en arriere un jour de changement
 * d'heure) pour la comparer a ce qui etait prevu.
 */
export const STATION_REPORT_HOURS = 60;

const HOUR_MS = 60 * 60 * 1000;

export async function getStationReport(
  place: Place,
  models: readonly ModelId[],
): Promise<HttpResult<DatasetResult<StationReport>>> {
  const match = await stationFor(place);
  if (match === null) {
    const report: StationReport = {
      match: null,
      records: [],
      models: null,
      previousDay: null,
      snapshots: [],
    };
    return { ok: true, value: { value: report, fetchedAt: Date.now(), stale: false } };
  }
  return throughCache({
    kind: 'station',
    placeId: `${place.id}|${[...models].sort().join(',')}`,
    ttlMs: CACHE_TTL_MS.station,
    fetcher: async (): Promise<HttpResult<StationReport>> => {
      const now = Date.now();
      const since = now - STATION_REPORT_HOURS * HOUR_MS;
      // Modeles lus au point et a l'altitude de la station, en parallele des
      // releves : la comparaison se fait station a station.
      const stationPoint = {
        latitude: match.station.latitude,
        longitude: match.station.longitude,
        elevation: match.station.elevation,
        models,
      };
      const modelsAtStation = fetchStationPoint(stationPoint);
      const forecastsOfYesterday = fetchStationPreviousDay(stationPoint);
      // Deux fichiers annuels les premieres heures de janvier. Le fichier
      // de l'annee qui commence peut manquer : on garde ce qui repond.
      const years = [
        ...new Set([new Date(since).getUTCFullYear(), new Date(now).getUTCFullYear()]),
      ];
      const records: StationRecord[] = [];
      let failure: HttpResult<StationReport> | null = null;
      for (const year of years) {
        const text = await fetchStationYear(match.station.id, year);
        if (text.ok) {
          records.push(...parseStationRecords(text.value, since));
        } else {
          failure = text;
        }
      }
      // Sans valeurs de modele, le releve reste utile : rendu sans ecart.
      const atStation = await modelsAtStation;
      const ofYesterday = await forecastsOfYesterday;
      // Chaque lecture de la station enregistre les 12 heures a venir de chaque
      // modele : une fois la mesure publiee, elles servent a noter les echeances courtes.
      const snapshot = atStation.ok ? takeSnapshot(atStation.value, new Date(now)) : null;
      const snapshots =
        snapshot === null
          ? await loadSnapshots(match.station.id)
          : await recordSnapshot(match.station.id, snapshot, new Date(now));
      if (failure !== null && records.length === 0) {
        return failure;
      }
      return {
        ok: true,
        value: {
          match,
          records,
          models: atStation.ok ? atStation.value : null,
          previousDay: ofYesterday.ok ? ofYesterday.value : null,
          snapshots,
        },
      };
    },
  });
}

/**
 * Carte de prevision autour du lieu, pour un modele. Chargee seulement a
 * l'ouverture de la carte : une requete couvre toute la grille, mais
 * Open-Meteo la compte comme autant d'appels que de points.
 */
export function getForecastGrid(
  place: Place,
  model: ModelId,
): Promise<HttpResult<DatasetResult<ForecastGrid>>> {
  const points = gridPoints(place, FORECAST_GRID.size, FORECAST_GRID.stepKm);
  return throughCache({
    kind: 'grid',
    placeId: `${place.id}|${model}`,
    ttlMs: CACHE_TTL_MS.forecast,
    fetcher: () => fetchForecastGrid({ points, model, stepKm: FORECAST_GRID.stepKm }),
  });
}

let departmentsPromise: Promise<readonly Department[]> | null = null;

/**
 * Contours simplifies des departements, generes par
 * `scripts/generate-departments.py` et servis avec l'application. Liste
 * vide si le fichier manque : la vigilance est alors indisponible.
 */
export function loadDepartments(): Promise<readonly Department[]> {
  departmentsPromise ??= request<readonly Department[]>('/data/departements-fr.json', {
    retries: 0,
  }).then((result) => (result.ok && Array.isArray(result.value) ? result.value : []));
  return departmentsPromise;
}

/** Reinitialise les contours memorises. Utilise par les tests. */
export function resetDepartmentsForTests(): void {
  departmentsPromise = null;
}

/** Vigilance Meteo-France du departement du lieu. */
export interface VigilanceReport {
  /** null : lieu hors de France metropolitaine (ou contours indisponibles). */
  readonly department: { readonly code: string; readonly name: string } | null;
  readonly bulletin: VigilanceBulletin | null;
}

export async function getVigilance(
  place: Place,
): Promise<HttpResult<DatasetResult<VigilanceReport>>> {
  const found = departmentAt(place.latitude, place.longitude, await loadDepartments());
  if (found === null) {
    const report: VigilanceReport = { department: null, bulletin: null };
    return { ok: true, value: { value: report, fetchedAt: Date.now(), stale: false } };
  }
  const department = { code: found.code, name: found.name };
  return throughCache({
    kind: 'vigilance',
    placeId: department.code,
    ttlMs: CACHE_TTL_MS.vigilance,
    fetcher: async (): Promise<HttpResult<VigilanceReport>> => {
      const result = await fetchVigilance(department.code);
      return result.ok ? { ok: true, value: { department, bulletin: result.value } } : result;
    },
  });
}
