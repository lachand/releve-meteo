import { localIsoFromUtc, utcMsFromLocalIso } from './time';
import type { LocalIsoHour } from './types';

// Constantes de Magnus-Tetens usuelles en meteorologie.
const MAGNUS_B = 17.62;
const MAGNUS_C = 243.12;

/** Formule de Magnus-Tetens. Tolerance attendue: 0.1 °C. */
export function dewPoint(temperatureC: number, relativeHumidity: number): number {
  const gamma =
    Math.log(relativeHumidity / 100) + (MAGNUS_B * temperatureC) / (MAGNUS_C + temperatureC);
  return (MAGNUS_C * gamma) / (MAGNUS_B - gamma);
}

const FROST_LIKELY_MAX_C = 0;
const FROST_POSSIBLE_MAX_C = 2;

export function frostRisk(minTemperatureC: number | null): 'none' | 'possible' | 'likely' {
  if (minTemperatureC === null) {
    return 'none';
  }
  if (minTemperatureC <= FROST_LIKELY_MAX_C) {
    return 'likely';
  }
  if (minTemperatureC < FROST_POSSIBLE_MAX_C) {
    return 'possible';
  }
  return 'none';
}

// Seuils "likely" fixes par ARCHITECTURE.md section 3.7. Le palier
// "possible" n'y est pas chiffre : ecart et vent elargis par prudence,
// ecart consigne dans BACKLOG.md.
const FOG_LIKELY_SPREAD_C = 1;
const FOG_LIKELY_WIND_KMH = 8;
const FOG_POSSIBLE_SPREAD_C = 3;
const FOG_POSSIBLE_WIND_KMH = 15;

export function fogRisk(input: {
  readonly temperatureC: number;
  readonly dewPointC: number;
  readonly windSpeedKmh: number;
}): 'none' | 'possible' | 'likely' {
  const spread = input.temperatureC - input.dewPointC;
  if (spread < FOG_LIKELY_SPREAD_C && input.windSpeedKmh < FOG_LIKELY_WIND_KMH) {
    return 'likely';
  }
  if (spread < FOG_POSSIBLE_SPREAD_C && input.windSpeedKmh < FOG_POSSIBLE_WIND_KMH) {
    return 'possible';
  }
  return 'none';
}

/** Cumul glissant. Les null sont ignores, pas comptes comme zero. */
export function rollingSum(
  values: readonly (number | null)[],
  windowSize: number,
): readonly (number | null)[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const known = values.slice(start, index + 1).filter((value): value is number => value !== null);
    if (known.length === 0) {
      return null;
    }
    return known.reduce((sum, value) => sum + value, 0);
  });
}

/**
 * Cumul d'une fenetre : total des valeurs connues et nombre d'heures sans
 * valeur, pour dire « au moins » plutot que de compter un trou comme zero.
 * `total` est null si aucune valeur n'est connue.
 */
export function windowTotal(values: readonly (number | null)[]): {
  readonly total: number | null;
  readonly missing: number;
} {
  let total = 0;
  let known = 0;
  for (const value of values) {
    if (value !== null) {
      total += value;
      known += 1;
    }
  }
  return { total: known === 0 ? null : total, missing: values.length - known };
}

const STANDARD_TEST_CONDITION_WM2 = 1000;
const DEFAULT_SYSTEM_LOSS = 0.2;

/** Production PV estimee, en kWh. systemLoss par defaut 0.20. */
export function solarYieldKwh(
  radiationWm2: readonly (number | null)[],
  peakKwp: number,
  systemLoss: number = DEFAULT_SYSTEM_LOSS,
): number {
  const knownValues = radiationWm2.filter((value): value is number => value !== null);
  if (knownValues.length === 0) {
    return 0;
  }
  // Chaque valeur horaire en W/m2 integree sur 1h donne des Wh/m2 ; rapportee
  // aux 1000 W/m2 des conditions de test standard (STC), on obtient un
  // nombre "d'heures pleine puissance" a multiplier par la puissance crete.
  const totalIrradianceWhM2 = knownValues.reduce((sum, value) => sum + value, 0);
  const peakSunHours = totalIrradianceWhM2 / STANDARD_TEST_CONDITION_WM2;
  return peakSunHours * peakKwp * (1 - systemLoss);
}

/** Duree du jour et heures dorees (la premiere heure apres le lever, la derniere avant le coucher). */
export interface DayLightSpan {
  /** Du lever au coucher, minutes. */
  readonly minutes: number;
  readonly morningGolden: { readonly from: LocalIsoHour; readonly to: LocalIsoHour };
  readonly eveningGolden: { readonly from: LocalIsoHour; readonly to: LocalIsoHour };
}

const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Duree du jour a partir des heures locales de lever et de coucher, ou
 * null si l'une manque, est illisible, ou si le coucher ne suit pas le
 * lever : jamais une duree inventee.
 */
export function dayLightSpan(sunrise: string | null, sunset: string | null): DayLightSpan | null {
  if (sunrise === null || sunset === null || !LOCAL_ISO.test(sunrise) || !LOCAL_ISO.test(sunset)) {
    return null;
  }
  const rise = utcMsFromLocalIso(sunrise);
  const set = utcMsFromLocalIso(sunset);
  if (set <= rise) {
    return null;
  }
  return {
    minutes: Math.round((set - rise) / 60000),
    morningGolden: { from: sunrise, to: localIsoFromUtc(rise + HOUR_MS) },
    eveningGolden: { from: localIsoFromUtc(set - HOUR_MS), to: sunset },
  };
}
