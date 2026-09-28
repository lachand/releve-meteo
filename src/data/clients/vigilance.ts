import { VIGILANCE_PHENOMENA } from '../../domain/vigilance';
import type { VigilanceBulletin, VigilanceLevel, VigilancePeriod } from '../../domain/vigilance';
import { request } from './http';
import type { HttpResult } from './http';

/*
 * Vigilance meteorologique de Meteo-France, niveau departemental, via le
 * jeu public d'Opendatasoft qui la republie (editeur Meteo-France, Licence
 * Ouverte, rafraichi plusieurs fois par jour, sans cle, CORS ouvert ;
 * verifie le 2026-09-28). L'API directe de Meteo-France exige une cle
 * personnelle.
 *
 * Un departement a deux domaines : son code INSEE, et son littoral
 * (code suivi de « 10 ») pour les vagues-submersion.
 */

const RECORDS_URL =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records';

interface RawRecord {
  readonly domain_id?: unknown;
  readonly phenomenon_id?: unknown;
  readonly color_id?: unknown;
  readonly begin_time?: unknown;
  readonly end_time?: unknown;
  readonly product_datetime?: unknown;
}

export function buildVigilanceUrl(department: string): string {
  const url = new URL(RECORDS_URL);
  url.searchParams.set('where', `domain_id in ("${department}","${department}10")`);
  url.searchParams.set('limit', '100');
  return url.toString();
}

function isLevel(value: unknown): value is VigilanceLevel {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Enregistrements bruts vers bulletin. Un enregistrement illisible est
 * ecarte, jamais complete ; aucun enregistrement lisible : echec.
 */
export function mapVigilance(raw: unknown, department: string): HttpResult<VigilanceBulletin> {
  const records = (raw as { results?: unknown } | null)?.results;
  if (!Array.isArray(records)) {
    return { ok: false, failure: { kind: 'malformed', detail: 'vigilance sans resultats' } };
  }
  let issuedUtcMs = -Infinity;
  const periods: VigilancePeriod[] = [];
  for (const record of records as readonly RawRecord[]) {
    const phenomenon =
      typeof record.phenomenon_id === 'number'
        ? VIGILANCE_PHENOMENA[record.phenomenon_id]
        : undefined;
    const beginUtcMs = parseTime(record.begin_time);
    const endUtcMs = parseTime(record.end_time);
    const issued = parseTime(record.product_datetime);
    if (
      phenomenon === undefined ||
      !isLevel(record.color_id) ||
      beginUtcMs === null ||
      endUtcMs === null ||
      issued === null ||
      (record.domain_id !== department && record.domain_id !== `${department}10`)
    ) {
      continue;
    }
    issuedUtcMs = Math.max(issuedUtcMs, issued);
    periods.push({
      phenomenon,
      level: record.color_id,
      beginUtcMs,
      endUtcMs,
      coastal: record.domain_id !== department,
    });
  }
  if (periods.length === 0) {
    return {
      ok: false,
      failure: { kind: 'malformed', detail: `vigilance sans periode lisible pour ${department}` },
    };
  }
  return { ok: true, value: { department, issuedUtcMs, periods } };
}

export async function fetchVigilance(department: string): Promise<HttpResult<VigilanceBulletin>> {
  const result = await request<unknown>(buildVigilanceUrl(department));
  return result.ok ? mapVigilance(result.value, department) : result;
}
