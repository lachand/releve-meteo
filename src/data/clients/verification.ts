import { verifyModel } from '../../domain/reliability';
import type { ModelVerification, VerificationPair } from '../../domain/reliability';
import type { StationMatch } from '../../domain/stations';
import type { LocalIsoHour, ModelId, Provenance, WeatherVariable } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';
import { fetchStationObservations } from './meteostat';
import type { ObservationSeries } from './meteostat';
import { OPEN_METEO_MODEL_IDS } from './openMeteo';

/*
 * Verification contre le reel (ROADMAP.md C1, C2).
 *
 * Prevu : Previous Runs API Open-Meteo. Pour chaque heure passee, la
 * valeur prevue par l'execution de la veille (`_previous_day1`), de
 * l'avant-veille (`_previous_day2`), etc. Aucune attente de collecte : les
 * scores existent des la premiere visite.
 *
 * Lieu de la verification : le point de la station retenue s'il y en a
 * une (prevision et mesure au meme endroit), sinon le lieu lui-meme.
 *
 * Reel, par ordre de preference et variable par variable :
 *  1. la station Meteostat la plus proche si elle est representative du
 *     lieu (distance et denivele bornes, cf. domain/stations.ts) et si
 *     elle a mesure la variable sur au moins la moitie de la fenetre :
 *     provenance 'observed' ;
 *  2. sinon la reanalyse ERA5 (archive-api, environ cinq jours de
 *     retard) : provenance 'estimated'. ERA5 est produite par l'ECMWF sur
 *     une maille lache : elle avantage ECMWF et penalise les modeles fins
 *     la ou le relief ou la ville creent des effets locaux. L'interface le
 *     dit chaque fois qu'elle s'en sert.
 */

export const VERIFICATION_WINDOW_DAYS = 30;
/** Retard de publication d'ERA5 chez Open-Meteo, jours, plus un jour de marge. */
export const REANALYSIS_DELAY_DAYS = 6;
/** Part minimale d'heures observees pour qu'une station fasse reference. */
export const MIN_STATION_COVERAGE = 0.5;
/**
 * Echeances verifiees, en jours. L'API conserve les executions jusqu'a
 * J-7 : c'est ce qui rend inutile une archive locale des previsions
 * (prevue au Lot 7, remplacee, cf. BACKLOG.md Ecarts constates).
 */
export const VERIFICATION_LEAD_DAYS = [1, 2, 3, 5, 7] as const;

const VARIABLE_KEYS: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'temperature_2m',
  precipitation: 'precipitation',
  wind: 'wind_speed_10m',
};

const VARIABLES = Object.keys(VARIABLE_KEYS) as WeatherVariable[];

type RawBlock = Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;

export interface RawHourlyResponse {
  readonly hourly?: RawBlock;
}

export interface VerificationWindow {
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string;
}

/** Source de verite retenue pour une variable. */
export interface VerificationReference {
  readonly variable: WeatherVariable;
  readonly provenance: Provenance;
  readonly window: VerificationWindow;
  /** Station retenue si provenance 'observed'. */
  readonly station: StationMatch | null;
}

export interface VerificationReport {
  readonly verifications: readonly ModelVerification[];
  readonly references: readonly VerificationReference[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** Fenetre de `VERIFICATION_WINDOW_DAYS` jours se terminant `delayDays` jours avant `now`. */
export function verificationWindow(now: Date, delayDays: number): VerificationWindow {
  const end = now.getTime() - delayDays * DAY_MS;
  return {
    startDate: isoDate(end - (VERIFICATION_WINDOW_DAYS - 1) * DAY_MS),
    endDate: isoDate(end),
  };
}

/** Altitude transmise a Open-Meteo pour corriger la temperature du relief. */
function setElevation(url: URL, elevation: number | null | undefined): void {
  if (elevation !== undefined && elevation !== null) {
    url.searchParams.set('elevation', String(elevation));
  }
}

export function buildPreviousRunsUrl(input: {
  readonly latitude: number;
  readonly longitude: number;
  /** Altitude de la station, si connue : verification a son altitude. */
  readonly elevation?: number | null;
  readonly models: readonly ModelId[];
  readonly window: VerificationWindow;
}): string {
  const url = new URL('https://previous-runs-api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(input.latitude));
  url.searchParams.set('longitude', String(input.longitude));
  setElevation(url, input.elevation);
  url.searchParams.set('models', input.models.map((m) => OPEN_METEO_MODEL_IDS[m]).join(','));
  const hourly: string[] = [];
  for (const variable of VARIABLES) {
    for (const lead of VERIFICATION_LEAD_DAYS) {
      hourly.push(`${VARIABLE_KEYS[variable]}_previous_day${lead}`);
    }
  }
  url.searchParams.set('hourly', hourly.join(','));
  url.searchParams.set('timezone', 'Europe/Paris');
  url.searchParams.set('start_date', input.window.startDate);
  url.searchParams.set('end_date', input.window.endDate);
  return url.toString();
}

export function buildReanalysisUrl(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation?: number | null;
  readonly window: VerificationWindow;
}): string {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(input.latitude));
  url.searchParams.set('longitude', String(input.longitude));
  setElevation(url, input.elevation);
  url.searchParams.set('hourly', VARIABLES.map((v) => VARIABLE_KEYS[v]).join(','));
  url.searchParams.set('timezone', 'Europe/Paris');
  url.searchParams.set('start_date', input.window.startDate);
  url.searchParams.set('end_date', input.window.endDate);
  return url.toString();
}

function numericSeries(block: RawBlock, key: string): readonly (number | null)[] | null {
  const raw = block[key];
  return raw === undefined ? null : (raw as readonly (number | null)[]);
}

function isInWindow(time: LocalIsoHour, window: VerificationWindow): boolean {
  const date = time.slice(0, 10);
  return date >= window.startDate && date <= window.endDate;
}

/** Serie de reference d'une reanalyse, indexee par heure locale. */
export function reanalysisSeries(reanalysis: RawHourlyResponse): ObservationSeries | null {
  const block = reanalysis.hourly;
  const time = block?.time;
  if (block === undefined || time === undefined) {
    return null;
  }
  const result: Record<WeatherVariable, Map<LocalIsoHour, number>> = {
    temperature: new Map(),
    precipitation: new Map(),
    wind: new Map(),
  };
  for (const variable of VARIABLES) {
    const values = numericSeries(block, VARIABLE_KEYS[variable]);
    if (values === null) {
      continue;
    }
    for (const [index, t] of (time as readonly string[]).entries()) {
      const value = values[index] ?? null;
      if (value !== null) {
        result[variable].set(t, value);
      }
    }
  }
  return result;
}

/** Nombre d'heures observees dans la fenetre. */
function coverage(series: ReadonlyMap<LocalIsoHour, number>, window: VerificationWindow): number {
  let count = 0;
  for (const time of series.keys()) {
    if (isInWindow(time, window)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Choisit la reference de chaque variable : station si elle couvre au
 * moins MIN_STATION_COVERAGE de sa fenetre, sinon reanalyse.
 */
export function chooseReferences(input: {
  readonly station: StationMatch | null;
  readonly stationSeries: ObservationSeries | null;
  readonly stationWindow: VerificationWindow;
  readonly reanalysisWindow: VerificationWindow;
}): readonly VerificationReference[] {
  const expectedHours = VERIFICATION_WINDOW_DAYS * 24;
  return VARIABLES.map((variable): VerificationReference => {
    const series = input.stationSeries?.[variable];
    if (
      input.station !== null &&
      series !== undefined &&
      coverage(series, input.stationWindow) >= expectedHours * MIN_STATION_COVERAGE
    ) {
      return {
        variable,
        provenance: 'observed',
        window: input.stationWindow,
        station: input.station,
      };
    }
    return { variable, provenance: 'estimated', window: input.reanalysisWindow, station: null };
  });
}

/**
 * Apparie previsions passees et reference, heure par heure, sur l'heure
 * locale (jamais par index : les deux axes n'ont pas la meme longueur).
 */
export function buildVerifications(input: {
  readonly models: readonly ModelId[];
  readonly previousRuns: RawHourlyResponse;
  readonly references: readonly VerificationReference[];
  readonly truth: Readonly<Record<Provenance, ObservationSeries | null>>;
}): HttpResult<readonly ModelVerification[]> {
  const block = input.previousRuns.hourly;
  const forecastTime = block?.time;
  if (block === undefined || forecastTime === undefined) {
    return { ok: false, failure: { kind: 'malformed', detail: 'verification sans bloc horaire' } };
  }

  const suffixed = input.models.length > 1;
  const verifications: ModelVerification[] = [];
  for (const reference of input.references) {
    const truth = input.truth[reference.provenance]?.[reference.variable];
    if (truth === undefined) {
      continue;
    }
    for (const model of input.models) {
      for (const lead of VERIFICATION_LEAD_DAYS) {
        const base = `${VARIABLE_KEYS[reference.variable]}_previous_day${lead}`;
        const predicted = numericSeries(
          block,
          suffixed ? `${base}_${OPEN_METEO_MODEL_IDS[model]}` : base,
        );
        if (predicted === null || predicted.every((v) => v === null)) {
          continue;
        }
        const pairs: VerificationPair[] = [];
        for (const [index, time] of (forecastTime as readonly string[]).entries()) {
          if (!isInWindow(time, reference.window)) {
            continue;
          }
          pairs.push({ predicted: predicted[index] ?? null, observed: truth.get(time) ?? null });
        }
        verifications.push(
          verifyModel({
            model,
            variable: reference.variable,
            leadDays: lead,
            pairs,
            reference: reference.provenance,
          }),
        );
      }
    }
  }
  return { ok: true, value: verifications };
}

function yearsOf(window: VerificationWindow): readonly number[] {
  const first = Number(window.startDate.slice(0, 4));
  const last = Number(window.endDate.slice(0, 4));
  return first === last ? [first] : [first, last];
}

export async function fetchVerifications(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly models: readonly ModelId[];
  readonly station: StationMatch | null;
  readonly now: Date;
  readonly signal?: AbortSignal;
}): Promise<HttpResult<VerificationReport>> {
  const stationWindow = verificationWindow(input.now, 1);
  const reanalysisWindow = verificationWindow(input.now, REANALYSIS_DELAY_DAYS);
  const unionWindow: VerificationWindow = {
    startDate: reanalysisWindow.startDate,
    endDate: stationWindow.endDate,
  };
  const options = { signal: input.signal, timeoutMs: 25000 };
  // Les modeles sont verifies la ou l'on mesure : au point de la station
  // quand il y en a une. Comparer la prevision du centre-ville a la mesure
  // de l'aeroport voisin penaliserait a tort les modeles fins, qui
  // representent justement l'ilot de chaleur urbain ou l'effet de vallee.
  // A son altitude aussi : Open-Meteo corrige alors la temperature du relief
  // entre sa maille et la station.
  const point =
    input.station === null
      ? { latitude: input.latitude, longitude: input.longitude, elevation: null }
      : {
          latitude: input.station.station.latitude,
          longitude: input.station.station.longitude,
          elevation: input.station.station.elevation,
        };

  const [previousRuns, reanalysis, observations] = await Promise.all([
    request<RawHourlyResponse>(
      buildPreviousRunsUrl({ ...point, models: input.models, window: unionWindow }),
      options,
    ),
    request<RawHourlyResponse>(buildReanalysisUrl({ ...point, window: reanalysisWindow }), options),
    input.station === null
      ? Promise.resolve(null)
      : // Telechargement partage avec le releve du jour : jamais interrompu
        // par un seul de ses lecteurs, donc sans signal d'annulation.
        fetchStationObservations({
          stationId: input.station.station.id,
          years: yearsOf(stationWindow),
        }),
  ]);
  if (!previousRuns.ok) {
    return previousRuns;
  }
  // Station injoignable : on se replie sur la reanalyse, sans echouer.
  const stationSeries = observations !== null && observations.ok ? observations.value : null;
  const truthEstimated = reanalysis.ok ? reanalysisSeries(reanalysis.value) : null;
  if (stationSeries === null && truthEstimated === null) {
    return reanalysis.ok
      ? { ok: false, failure: { kind: 'malformed', detail: 'aucune reference exploitable' } }
      : reanalysis;
  }
  const references = chooseReferences({
    station: stationSeries === null ? null : input.station,
    stationSeries,
    stationWindow,
    reanalysisWindow,
  }).filter((reference) => reference.provenance === 'observed' || truthEstimated !== null);

  const verifications = buildVerifications({
    models: input.models,
    previousRuns: previousRuns.value,
    references,
    truth: { observed: stationSeries, estimated: truthEstimated, forecast: null },
  });
  if (!verifications.ok) {
    return verifications;
  }
  return { ok: true, value: { verifications: verifications.value, references } };
}
