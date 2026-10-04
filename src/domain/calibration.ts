import { leadHoursFrom } from './time';
import type { ConfidenceVerdict } from './confidence';
import type { DayConfidence, DaySummary, OutlookIssue } from './forecastDrift';
import type { JournalEntry } from './journal';
import { MODEL_ORDER } from './models';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Confiance auto-evaluee : quand Relevé disait « confiance elevee » pour la
 * temperature d'un jour, de combien la prevision s'est-elle ecartee de la
 * mesure ? Chaque jour qui entre au journal (bilan d'hier) est rapproche de la
 * prevision gardee la veille et de la confiance qu'elle portait. Rien n'est
 * recalcule apres coup, et rien n'est dit avant d'avoir assez de jours : le
 * produit s'audite, il n'affirme pas sa confiance.
 */

export const CALIBRATION = {
  /** Jours gardes, au plus. */
  maxDays: 365,
  /** Un jour est « dans la marge » quand l'erreur moyenne du maximum et du minimum ne depasse pas ce nombre de degres. */
  withinDegrees: 1.5,
  /** Jours par niveau pour oser dire que la confiance est graduee (ou non). */
  minDaysPerLevel: 8,
  /** La prevision comparee est celle emise vers 24 h avant midi du jour, a cette tolerance pres, heures. */
  targetLeadHours: 24,
  leadToleranceHours: 12,
} as const;

/** Un jour verifie : la confiance dite, et de combien la temperature s'est ecartee de la mesure. */
export interface CalibrationRecord {
  readonly date: string; // 'YYYY-MM-DD'
  readonly level: DayConfidence;
  /** Erreur absolue moyenne du maximum et du minimum prevus, °C. */
  readonly error: number;
  /** Modele dont viennent les valeurs comparees. */
  readonly model: ModelId;
  /** Instant de la prevision comparee, epoch ms. */
  readonly issuedAt: number;
}

/**
 * Confiance de la temperature d'un jour, a midi (l'heure qui represente le
 * jour) : le niveau cote temperature seulement, null quand il n'est pas note.
 */
export function temperatureConfidenceOn(
  date: string,
  timeline: readonly LocalIsoHour[],
  verdicts: readonly ConfidenceVerdict[],
): DayConfidence | null {
  const index = timeline.indexOf(`${date}T12:00`);
  const level = index === -1 ? undefined : verdicts[index]?.byVariable.temperature;
  return level === 'high' || level === 'medium' || level === 'low' ? level : null;
}

/**
 * Le jour du journal rapproche de la prevision gardee la veille : null sans
 * prevision emise vers 24 h avant midi, sans confiance ou sans valeur
 * comparable (jamais comparee a un zero).
 */
export function calibrationRecordFrom(input: {
  readonly entry: JournalEntry;
  readonly issues: readonly OutlookIssue[];
}): CalibrationRecord | null {
  const { entry } = input;
  const noon: LocalIsoHour = `${entry.date}T12:00`;
  let best: { issue: OutlookIssue; day: DaySummary; gap: number } | null = null;
  for (const issue of input.issues) {
    const lead = leadHoursFrom(new Date(issue.issuedAt), noon);
    const gap = Math.abs(lead - CALIBRATION.targetLeadHours);
    const day = issue.days.find((d) => d.date === entry.date);
    if (
      day === undefined ||
      gap > CALIBRATION.leadToleranceHours ||
      (best !== null && gap >= best.gap)
    ) {
      continue;
    }
    best = { issue, day, gap };
  }
  const level = best?.day.confidence;
  if (best === null || (level !== 'high' && level !== 'medium' && level !== 'low')) {
    return null;
  }
  const errors = [
    best.day.tempMax === null ? null : Math.abs(best.day.tempMax - entry.observedMax),
    best.day.tempMin === null ? null : Math.abs(best.day.tempMin - entry.observedMin),
  ].filter((e): e is number => e !== null);
  if (errors.length === 0) {
    return null;
  }
  return {
    date: entry.date,
    level,
    error: errors.reduce((sum, e) => sum + e, 0) / errors.length,
    model: best.day.model,
    issuedAt: best.issue.issuedAt,
  };
}

export function isCalibrationRecord(value: unknown): value is CalibrationRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
    (record.level === 'high' || record.level === 'medium' || record.level === 'low') &&
    typeof record.error === 'number' &&
    Number.isFinite(record.error) &&
    record.error >= 0 &&
    (MODEL_ORDER as readonly unknown[]).includes(record.model) &&
    typeof record.issuedAt === 'number' &&
    Number.isFinite(record.issuedAt)
  );
}

/** Ajoute le jour (celui du meme jour est remplace), du plus recent au plus ancien ; les illisibles sont ecartes. */
export function mergeCalibration(
  existing: unknown,
  record: CalibrationRecord,
): readonly CalibrationRecord[] {
  const kept = (Array.isArray(existing) ? existing : []).filter(
    (candidate): candidate is CalibrationRecord =>
      isCalibrationRecord(candidate) && candidate.date !== record.date,
  );
  return [record, ...kept]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, CALIBRATION.maxDays);
}

export interface LevelCalibration {
  readonly level: DayConfidence;
  readonly days: number;
  /** Erreur moyenne des jours ainsi annonces, °C. */
  readonly meanError: number;
  /** Part de ces jours dans la marge (CALIBRATION.withinDegrees), [0, 1]. */
  readonly within: number;
}

export interface CalibrationSummary {
  readonly days: number;
  readonly from: string;
  readonly to: string;
  /** Du plus confiant au moins confiant, seulement les niveaux qui ont des jours. */
  readonly levels: readonly LevelCalibration[];
  /**
   * La confiance elevee s'est-elle montree plus juste que la basse ? null tant
   * qu'un des deux niveaux compte moins de CALIBRATION.minDaysPerLevel jours.
   */
  readonly graded: boolean | null;
}

const LEVELS: readonly DayConfidence[] = ['high', 'medium', 'low'];

/** Bilan de la confiance dite, ou null quand rien n'est enregistre. */
export function calibrationSummary(
  records: readonly CalibrationRecord[],
): CalibrationSummary | null {
  const first = records.at(-1);
  const last = records[0];
  if (first === undefined || last === undefined) {
    return null;
  }
  const levels = LEVELS.flatMap((level): LevelCalibration[] => {
    const own = records.filter((r) => r.level === level);
    if (own.length === 0) {
      return [];
    }
    return [
      {
        level,
        days: own.length,
        meanError: own.reduce((sum, r) => sum + r.error, 0) / own.length,
        within: own.filter((r) => r.error <= CALIBRATION.withinDegrees).length / own.length,
      },
    ];
  });
  const high = levels.find((l) => l.level === 'high');
  const low = levels.find((l) => l.level === 'low');
  const enough =
    high !== undefined &&
    low !== undefined &&
    high.days >= CALIBRATION.minDaysPerLevel &&
    low.days >= CALIBRATION.minDaysPerLevel;
  return {
    days: records.length,
    from: first.date,
    to: last.date,
    levels,
    graded: enough ? high.meanError < low.meanError : null,
  };
}
