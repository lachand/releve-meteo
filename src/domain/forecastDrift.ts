import { MODEL_ORDER } from './models';
import { localIsoFromUtc } from './time';
import type { BlendedDay } from './dailyBlend';
import type { ModelId } from './types';

/*
 * « La prevision a bouge » : ce que Relevé annoncait hier pour chaque jour a
 * venir face a ce qu'il annonce maintenant. Rien n'est demande a une API : la
 * prevision de la veille est celle que cet appareil a lui-meme gardee. Sans
 * prevision gardee vers 24 h avant, on ne compare pas (jamais une autre
 * echeance presentee comme « hier »). Le modele de chaque jour est garde :
 * un ecart peut venir d'un autre modele, pas d'une nouvelle prevision, et le
 * dit.
 */

export const DRIFT = {
  /** Retention des previsions gardees, heures. */
  retentionHours: 72,
  /** Une prevision par heure d'emission, au plus. */
  maxIssues: 80,
  /** Fenetre de la prevision « de la veille » : emise entre ces ages, heures. */
  minAgeHours: 18,
  maxAgeHours: 36,
  targetAgeHours: 24,
  /** Un jour a bouge quand un maximum ou un minimum change d'au moins ce nombre de degres. */
  temperatureDegrees: 2,
  /** ... ou quand son cumul de pluie change d'au moins ce nombre de mm. */
  rainMm: 2,
  /** ... ou quand il passe du sec au mouille (ou l'inverse) autour de ce cumul, mm. */
  wetDayMm: 1,
} as const;

const HOUR_MS = 60 * 60 * 1000;

/** Confiance de la temperature d'un jour, telle que Relevé l'a dite (jamais « indisponible » : absente). */
export type DayConfidence = 'high' | 'medium' | 'low';

const DAY_CONFIDENCES: readonly unknown[] = ['high', 'medium', 'low'];

/** Ce qu'un jour annoncait : valeurs absentes gardees absentes. */
export interface DaySummary {
  readonly date: string; // 'YYYY-MM-DD'
  /** Modele dont viennent ces valeurs. */
  readonly model: ModelId;
  readonly tempMax: number | null;
  readonly tempMin: number | null;
  /** Cumul de pluie du jour, mm. */
  readonly rain: number | null;
  /** Confiance dite pour la temperature de ce jour, ou absente (anciens enregistrements, modeles seuls). */
  readonly confidence?: DayConfidence | null;
}

/** Une prevision gardee : l'instant ou elle a ete lue, et les jours qu'elle annoncait. */
export interface OutlookIssue {
  readonly issuedAt: number; // epoch ms
  readonly days: readonly DaySummary[];
}

export function summarizeDays(
  days: readonly BlendedDay[],
  confidenceOf: (date: string) => DayConfidence | null = () => null,
): readonly DaySummary[] {
  return days.map((day) => ({
    date: day.date,
    model: day.model,
    tempMax: day.tempMax.value,
    tempMin: day.tempMin.value,
    rain: day.precipitationSum.value,
    confidence: confidenceOf(day.date),
  }));
}

function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isDaySummary(value: unknown): value is DaySummary {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const day = value as Record<string, unknown>;
  return (
    typeof day.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
    (MODEL_ORDER as readonly unknown[]).includes(day.model) &&
    isNullableNumber(day.tempMax) &&
    isNullableNumber(day.tempMin) &&
    isNullableNumber(day.rain) &&
    (day.confidence === undefined ||
      day.confidence === null ||
      DAY_CONFIDENCES.includes(day.confidence))
  );
}

/** Un enregistrement abime ne doit jamais casser la comparaison. */
export function isOutlookIssue(value: unknown): value is OutlookIssue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const issue = value as Record<string, unknown>;
  return (
    typeof issue.issuedAt === 'number' &&
    Number.isFinite(issue.issuedAt) &&
    Array.isArray(issue.days) &&
    issue.days.every(isDaySummary)
  );
}

/**
 * Ajoute la prevision lue (celle de la meme heure d'emission est remplacee),
 * de la plus recente a la plus ancienne, sur la retention seulement.
 */
export function mergeOutlooks(
  existing: unknown,
  issue: OutlookIssue,
  now: Date,
): readonly OutlookIssue[] {
  const slot = (at: number) => Math.floor(at / HOUR_MS);
  const oldest = now.getTime() - DRIFT.retentionHours * HOUR_MS;
  const kept = (Array.isArray(existing) ? existing : []).filter(
    (candidate): candidate is OutlookIssue =>
      isOutlookIssue(candidate) &&
      candidate.issuedAt >= oldest &&
      slot(candidate.issuedAt) !== slot(issue.issuedAt),
  );
  return [issue, ...kept].sort((a, b) => b.issuedAt - a.issuedAt).slice(0, DRIFT.maxIssues);
}

/** La prevision emise le plus pres de 24 h avant, dans la fenetre ; null sinon. */
export function pickReference(issues: readonly OutlookIssue[], now: Date): OutlookIssue | null {
  let best: OutlookIssue | null = null;
  let bestGap = Infinity;
  for (const issue of issues) {
    const ageHours = (now.getTime() - issue.issuedAt) / HOUR_MS;
    if (ageHours < DRIFT.minAgeHours || ageHours > DRIFT.maxAgeHours) {
      continue;
    }
    const gap = Math.abs(ageHours - DRIFT.targetAgeHours);
    if (gap < bestGap) {
      best = issue;
      bestGap = gap;
    }
  }
  return best;
}

export interface Change {
  readonly before: number;
  readonly now: number;
  /** Maintenant moins avant, arrondi au dixieme. */
  readonly delta: number;
}

export interface DayDrift {
  readonly date: string;
  readonly tempMax: Change | null;
  readonly tempMin: Change | null;
  readonly rain: Change | null;
  readonly modelBefore: ModelId;
  readonly modelNow: ModelId;
  readonly modelChanged: boolean;
  /** Grandeurs dont le seuil de DRIFT est depasse. */
  readonly fields: readonly DriftField[];
  /** Au moins un seuil de DRIFT depasse. */
  readonly moved: boolean;
}

export type DriftField = 'tempMax' | 'tempMin' | 'rain';

export interface Drift {
  /** Instant de la prevision comparee. */
  readonly since: number;
  /** Tous les jours comparables, dans l'ordre des dates. */
  readonly days: readonly DayDrift[];
  /** Ceux qui ont bouge. */
  readonly moved: readonly DayDrift[];
}

function change(before: number | null, now: number | null): Change | null {
  if (before === null || now === null) {
    return null;
  }
  return { before, now, delta: Math.round((now - before) * 10) / 10 };
}

function rainMoved(rain: Change | null): boolean {
  if (rain === null) {
    return false;
  }
  const wasWet = rain.before >= DRIFT.wetDayMm;
  const isWet = rain.now >= DRIFT.wetDayMm;
  return Math.abs(rain.delta) >= DRIFT.rainMm || wasWet !== isWet;
}

/**
 * Ce qui a bouge entre la prevision de reference et la prevision actuelle,
 * pour les jours qui n'ont pas commence et que les deux annoncent. Une valeur
 * absente d'un cote reste absente : jamais comparee a un zero.
 */
export function driftOf(input: {
  readonly current: readonly DaySummary[];
  readonly reference: OutlookIssue;
  readonly now: Date;
}): Drift {
  const today = localIsoFromUtc(input.now.getTime()).slice(0, 10);
  const days = input.current
    .filter((day) => day.date >= today)
    .flatMap((day): DayDrift[] => {
      const before = input.reference.days.find((d) => d.date === day.date);
      if (before === undefined) {
        return [];
      }
      const tempMax = change(before.tempMax, day.tempMax);
      const tempMin = change(before.tempMin, day.tempMin);
      const rain = change(before.rain, day.rain);
      const fields: DriftField[] = [];
      if (tempMax !== null && Math.abs(tempMax.delta) >= DRIFT.temperatureDegrees) {
        fields.push('tempMax');
      }
      if (tempMin !== null && Math.abs(tempMin.delta) >= DRIFT.temperatureDegrees) {
        fields.push('tempMin');
      }
      if (rainMoved(rain)) {
        fields.push('rain');
      }
      return [
        {
          date: day.date,
          tempMax,
          tempMin,
          rain,
          modelBefore: before.model,
          modelNow: day.model,
          modelChanged: before.model !== day.model,
          fields,
          moved: fields.length > 0,
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { since: input.reference.issuedAt, days, moved: days.filter((day) => day.moved) };
}
