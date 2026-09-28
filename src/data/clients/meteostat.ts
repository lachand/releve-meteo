import { localIsoFromUtc } from '../../domain/time';
import type { LocalIsoHour, WeatherVariable } from '../../domain/types';
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

/**
 * Analyse un CSV Meteostat v3. Colonnes attendues : year, month, day,
 * hour (UTC), puis pour chaque grandeur sa valeur et sa source. Une ligne
 * incomplete ou une source non observee est ignoree, jamais convertie en
 * zero.
 */
export function parseMeteostatCsv(csv: string): ObservationSeries {
  const series: Record<WeatherVariable, Map<LocalIsoHour, number>> = {
    temperature: new Map(),
    precipitation: new Map(),
    wind: new Map(),
  };
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] ?? '').split(',');
  const col = (name: string): number => header.indexOf(name);
  const year = col('year');
  const month = col('month');
  const day = col('day');
  const hour = col('hour');
  if (year < 0 || month < 0 || day < 0 || hour < 0) {
    return series;
  }
  const variables = (Object.keys(COLUMNS) as WeatherVariable[]).map((variable) => ({
    variable,
    value: col(COLUMNS[variable]),
    source: col(`${COLUMNS[variable]}_source`),
  }));

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
    const time = localIsoFromUtc(utcMs);
    for (const { variable, value, source } of variables) {
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
        series[variable].set(time, number);
      }
    }
  }
  return series;
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

export async function fetchStationObservations(input: {
  readonly stationId: string;
  readonly years: readonly number[];
  readonly signal?: AbortSignal;
}): Promise<HttpResult<ObservationSeries>> {
  const parts: ObservationSeries[] = [];
  for (const year of input.years) {
    const result = await requestText(buildStationYearUrl(input.stationId, year), {
      gzip: true,
      signal: input.signal,
      timeoutMs: 20000,
    });
    if (!result.ok) {
      return result;
    }
    parts.push(parseMeteostatCsv(result.value));
  }
  return { ok: true, value: mergeObservations(parts) };
}
