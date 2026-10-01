import { leadHoursFrom } from './time';
import type { LocalIsoHour } from './types';

/*
 * Mer et houle pour les lieux du littoral : hauteur significative des
 * vagues, periode et direction, d'apres les modeles de vagues d'Open-Meteo
 * Marine. Prevision : jamais une mesure de bouee. Une hauteur absente reste
 * null, jamais une mer plate.
 */

/** Series horaires de vagues ; `waveHeight[i]` va avec `timeline[i]`. */
export interface MarineHourly {
  readonly timeline: readonly LocalIsoHour[];
  /** Hauteur significative des vagues, m. */
  readonly waveHeight: readonly (number | null)[];
  /** Periode des vagues, s. */
  readonly wavePeriod: readonly (number | null)[];
  /** Direction d'ou viennent les vagues, degres. */
  readonly waveDirection: readonly (number | null)[];
}

export const WAVE_OUTLOOK_HOURS = 48;

export interface WaveHour {
  readonly time: LocalIsoHour;
  readonly height: number | null;
  readonly period: number | null;
  readonly direction: number | null;
}

export interface WaveOutlook {
  /** L'heure courante, ou null quand sa hauteur manque. */
  readonly current: (WaveHour & { readonly height: number }) | null;
  /** Hauteur maximale des prochaines heures. */
  readonly peak: {
    readonly time: LocalIsoHour;
    readonly height: number;
    readonly period: number | null;
  } | null;
  readonly hours: readonly WaveHour[];
}

/** Heures de la fenetre, et leur creux et pic ; null sans aucune hauteur connue. */
export function waveOutlook(input: {
  readonly series: MarineHourly;
  readonly now: Date;
  readonly hours?: number;
}): WaveOutlook | null {
  const { series } = input;
  const horizon = input.hours ?? WAVE_OUTLOOK_HOURS;
  const hours = series.timeline.flatMap((time, index): WaveHour[] => {
    const lead = leadHoursFrom(input.now, time);
    if (lead < -1 || lead > horizon) {
      return [];
    }
    return [
      {
        time,
        height: series.waveHeight[index] ?? null,
        period: series.wavePeriod[index] ?? null,
        direction: series.waveDirection[index] ?? null,
      },
    ];
  });
  const known = hours.filter(
    (hour): hour is WaveHour & { readonly height: number } => hour.height !== null,
  );
  const [first] = known;
  if (first === undefined) {
    return null;
  }
  const peak = known.reduce((best, hour) => (hour.height > best.height ? hour : best), first);
  const now = hours[0];
  return {
    current: now !== undefined && now.height !== null ? { ...now, height: now.height } : null,
    peak: { time: peak.time, height: peak.height, period: peak.period },
    hours,
  };
}

/** Echelle de Douglas : etat de la mer d'apres la hauteur des vagues, m. */
export const WAVE_FORMS = [
  { upTo: 0.1, label: 'calme' },
  { upTo: 0.5, label: 'ridée' },
  { upTo: 1.25, label: 'belle' },
  { upTo: 2.5, label: 'agitée' },
  { upTo: 4, label: 'forte' },
  { upTo: 6, label: 'très forte' },
  { upTo: 9, label: 'grosse' },
] as const;

export function waveForm(heightM: number): string {
  return WAVE_FORMS.find((form) => heightM < form.upTo)?.label ?? 'énorme';
}
