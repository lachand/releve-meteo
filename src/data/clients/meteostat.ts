import type { StationRecord } from '../../domain/stationCheck';
import { localIsoFromUtc } from '../../domain/time';
import type { LocalIsoHour, Measure, WeatherVariable } from '../../domain/types';
import { requestText } from './http';
import type { HttpResult } from './http';

/*
 * Observations de stations via Meteostat (data.meteostat.net, CC BY-NC
 * 4.0, CORS ouvert). Un fichier CSV gzip par station et par annee,
 * horodate en UTC, mis a jour quotidiennement.
 *
 * Piege : le meme fichier melange observations reelles (METAR, SYNOP...)
 * et valeurs PREVUES par le modele statistique MOSMIX du DWD, qui
 * completent les trous et le futur. Comparer un modele a une prevision
 * serait une faute de methode : chaque valeur est filtree par sa colonne
 * `*_source`, et seules les sources d'observation connues sont retenues.
 */

/**
 * Sources Meteostat qui sont des mesures, jamais des sorties de modele.
 * Relevees en septembre 2026 sur les stations francaises : `metar` et
 * `dwd_poi` (rapports d'observation du DWD) sont des mesures ;
 * `dwd_mosmix` et `metno_forecast` sont des previsions, donc exclues. Meme
 * liste que scripts/generate-stations.py.
 */
export const OBSERVATION_SOURCES: ReadonlySet<string> = new Set([
  'metar',
  'dwd_poi',
  'synop',
  'isd_lite',
  'dwd_hourly',
  'dwd_synop',
]);

const COLUMNS: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'temp',
  precipitation: 'prcp',
  wind: 'wspd',
};

export type ObservationSeries = Readonly<
  Record<WeatherVariable, ReadonlyMap<LocalIsoHour, number>>
>;

export function buildStationYearUrl(stationId: string, year: number): string {
  return `https://data.meteostat.net/hourly/${year}/${encodeURIComponent(stationId)}.csv.gz`;
}

interface ObservedRow {
  readonly utcMs: number;
  /** Valeurs par nom de colonne, seulement celles dont la source est une observation. */
  readonly values: ReadonlyMap<string, number>;
}

/**
 * Lignes d'un CSV Meteostat v3. Colonnes attendues : year, month, day,
 * hour (UTC), puis pour chaque grandeur sa valeur et sa source. Une valeur
 * vide ou d'une source non observee est omise, jamais convertie en zero.
 */
function observedRows(csv: string, columns: readonly string[]): readonly ObservedRow[] {
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] ?? '').split(',');
  const col = (name: string): number => header.indexOf(name);
  const year = col('year');
  const month = col('month');
  const day = col('day');
  const hour = col('hour');
  if (year < 0 || month < 0 || day < 0 || hour < 0) {
    return [];
  }
  const indexes = columns.map((name) => ({
    name,
    value: col(name),
    source: col(`${name}_source`),
  }));

  const rows: ObservedRow[] = [];
  for (const line of lines.slice(1)) {
    if (line.length === 0) {
      continue;
    }
    const cells = line.split(',');
    const utcMs = Date.UTC(
      Number(cells[year]),
      Number(cells[month]) - 1,
      Number(cells[day]),
      Number(cells[hour]),
    );
    if (!Number.isFinite(utcMs)) {
      continue;
    }
    const values = new Map<string, number>();
    for (const { name, value, source } of indexes) {
      if (value < 0 || source < 0) {
        continue;
      }
      const raw = cells[value] ?? '';
      const origin = cells[source] ?? '';
      if (raw === '' || !OBSERVATION_SOURCES.has(origin)) {
        continue;
      }
      const number = Number(raw);
      if (Number.isFinite(number)) {
        values.set(name, number);
      }
    }
    rows.push({ utcMs, values });
  }
  return rows;
}

/** Series des grandeurs verifiees (temperature, pluie, vent), indexees par heure locale. */
export function parseMeteostatCsv(csv: string): ObservationSeries {
  const series: Record<WeatherVariable, Map<LocalIsoHour, number>> = {
    temperature: new Map(),
    precipitation: new Map(),
    wind: new Map(),
  };
  const variables = Object.keys(COLUMNS) as WeatherVariable[];
  for (const row of observedRows(
    csv,
    variables.map((variable) => COLUMNS[variable]),
  )) {
    const time = localIsoFromUtc(row.utcMs);
    for (const variable of variables) {
      const value = row.values.get(COLUMNS[variable]);
      if (value !== undefined) {
        series[variable].set(time, value);
      }
    }
  }
  return series;
}

/**
 * Grandeurs du releve de station et leur colonne Meteostat. Unites
 * Meteostat : °C, %, mm, km/h, degres, hPa (pression au niveau de la mer).
 */
const RECORD_COLUMNS = {
  temperature: 'temp',
  humidity: 'rhum',
  precipitation: 'prcp',
  windSpeed: 'wspd',
  windDirection: 'wdir',
  windGust: 'wpgt',
  pressure: 'pres',
} as const satisfies Readonly<Record<Exclude<keyof StationRecord, 'time'>, string>>;

/**
 * Heures relevees depuis `sinceUtcMs` inclus, dans l'ordre du fichier.
 * Chaque valeur porte la provenance 'observed' ; une heure sans aucune
 * mesure est omise.
 */
export function parseStationRecords(csv: string, sinceUtcMs: number): readonly StationRecord[] {
  const records: StationRecord[] = [];
  for (const row of observedRows(csv, Object.values(RECORD_COLUMNS))) {
    if (row.utcMs < sinceUtcMs || row.values.size === 0) {
      continue;
    }
    const observed = (column: string): Measure => ({
      value: row.values.get(column) ?? null,
      provenance: 'observed',
    });
    records.push({
      time: localIsoFromUtc(row.utcMs),
      temperature: observed(RECORD_COLUMNS.temperature),
      humidity: observed(RECORD_COLUMNS.humidity),
      precipitation: observed(RECORD_COLUMNS.precipitation),
      windSpeed: observed(RECORD_COLUMNS.windSpeed),
      windDirection: observed(RECORD_COLUMNS.windDirection),
      windGust: observed(RECORD_COLUMNS.windGust),
      pressure: observed(RECORD_COLUMNS.pressure),
    });
  }
  return records;
}

/** Fusionne les series de plusieurs annees (fenetre a cheval sur le 1er janvier). */
export function mergeObservations(parts: readonly ObservationSeries[]): ObservationSeries {
  const merged: Record<WeatherVariable, Map<LocalIsoHour, number>> = {
    temperature: new Map(),
    precipitation: new Map(),
    wind: new Map(),
  };
  for (const part of parts) {
    for (const variable of Object.keys(merged) as WeatherVariable[]) {
      for (const [time, value] of part[variable]) {
        merged[variable].set(time, value);
      }
    }
  }
  return merged;
}

/** Duree pendant laquelle un fichier station-annee telecharge est partage. */
export const STATION_DOWNLOAD_SHARE_MS = 15 * 60 * 1000;

const downloads = new Map<
  string,
  { readonly at: number; readonly result: Promise<HttpResult<string>> }
>();

/**
 * Fichier station-annee (CSV decompresse). La verification et le releve
 * du jour lisent le meme fichier : un seul telechargement les sert tous
 * deux pendant STATION_DOWNLOAD_SHARE_MS. Un echec n'est jamais partage.
 */
export function fetchStationYear(stationId: string, year: number): Promise<HttpResult<string>> {
  const url = buildStationYearUrl(stationId, year);
  const now = Date.now();
  const shared = downloads.get(url);
  if (shared !== undefined && now - shared.at < STATION_DOWNLOAD_SHARE_MS) {
    return shared.result;
  }
  const result = requestText(url, { gzip: true, timeoutMs: 20000 }).then((response) => {
    if (!response.ok) {
      downloads.delete(url);
    }
    return response;
  });
  downloads.set(url, { at: now, result });
  return result;
}

/** Oublie les telechargements partages. Utilise par les tests. */
export function resetStationDownloadsForTests(): void {
  downloads.clear();
}

export async function fetchStationObservations(input: {
  readonly stationId: string;
  readonly years: readonly number[];
}): Promise<HttpResult<ObservationSeries>> {
  const parts: ObservationSeries[] = [];
  for (const year of input.years) {
    const result = await fetchStationYear(input.stationId, year);
    if (!result.ok) {
      return result;
    }
    parts.push(parseMeteostatCsv(result.value));
  }
  return { ok: true, value: mergeObservations(parts) };
}
