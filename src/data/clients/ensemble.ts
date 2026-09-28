import type { EnsembleHourly } from '../../domain/ensemble';
import type { LocalIsoHour } from '../../domain/types';
import { request } from './http';
import type { HttpResult } from './http';

/**
 * API d'ensemble Open-Meteo (ensemble-api.open-meteo.com). Un seul systeme
 * par requete : avec plusieurs, les cles de membres sont suffixees par le
 * modele et le volume explose (51 membres x 360 heures x variables).
 * ECMWF ENS (IFS 0,25°, 51 membres, 15 jours) est la reference de moyenne
 * echeance.
 */
export const ENSEMBLE_MODEL = 'ecmwf_ifs025';
export const ENSEMBLE_FORECAST_DAYS = 15;

const ENSEMBLE_VARIABLES = ['temperature_2m', 'precipitation', 'wind_gusts_10m'] as const;

interface RawEnsembleResponse {
  readonly hourly?: Readonly<Record<string, readonly (number | null)[] | readonly string[]>>;
}

export function buildEnsembleUrl(latitude: number, longitude: number): string {
  const url = new URL('https://ensemble-api.open-meteo.com/v1/ensemble');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('models', ENSEMBLE_MODEL);
  url.searchParams.set('hourly', ENSEMBLE_VARIABLES.join(','));
  url.searchParams.set('timezone', 'Europe/Paris');
  url.searchParams.set('forecast_days', String(ENSEMBLE_FORECAST_DAYS));
  return url.toString();
}

/**
 * Extrait tous les membres d'une variable : la cle nue (`temperature_2m`,
 * membre de controle) et les cles `temperature_2m_memberNN`. Les cles
 * d'autres variables qui partagent le prefixe (`temperature_2m_max`...)
 * sont exclues par l'expression reguliere stricte.
 */
export function extractMembers(
  hourly: Readonly<Record<string, readonly (number | null)[] | readonly string[]>>,
  variable: string,
  length: number,
): readonly (readonly (number | null)[])[] {
  const pattern = new RegExp(`^${variable}(?:_member\\d+)?(?:_${ENSEMBLE_MODEL})?$`);
  const members: (readonly (number | null)[])[] = [];
  for (const [key, values] of Object.entries(hourly)) {
    if (!pattern.test(key) || values.length !== length) {
      continue;
    }
    members.push(values as readonly (number | null)[]);
  }
  return members;
}

export function mapEnsembleResponse(raw: RawEnsembleResponse): HttpResult<EnsembleHourly> {
  const hourly = raw.hourly;
  const time = hourly?.time;
  if (hourly === undefined || time === undefined) {
    return { ok: false, failure: { kind: 'malformed', detail: "ensemble sans bloc 'hourly'" } };
  }
  const timeline = time as readonly LocalIsoHour[];
  const temperature = extractMembers(hourly, 'temperature_2m', timeline.length);
  if (temperature.length === 0) {
    return { ok: false, failure: { kind: 'malformed', detail: 'ensemble sans membre' } };
  }
  return {
    ok: true,
    value: {
      timeline,
      temperature,
      precipitation: extractMembers(hourly, 'precipitation', timeline.length),
      windGust: extractMembers(hourly, 'wind_gusts_10m', timeline.length),
    },
  };
}

export async function fetchEnsemble(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<HttpResult<EnsembleHourly>> {
  const result = await request<RawEnsembleResponse>(buildEnsembleUrl(latitude, longitude), {
    signal,
    timeoutMs: 20000,
  });
  return result.ok ? mapEnsembleResponse(result.value) : result;
}
