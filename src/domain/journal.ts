import { MODEL_ORDER } from './models';
import type { YesterdayReview } from './yesterdayReview';
import type { ModelId } from './types';

/*
 * Journal des previsions : pour chaque jour ecoule, ce que chaque modele avait
 * prevu la veille face a ce que la station a mesure (le bilan « hier, prevu
 * contre reel »), garde sur l'appareil au-dela de la fenetre de 30 jours de la
 * verification. Rien n'est recalcule apres coup : une entree est le bilan tel
 * qu'il etait lisible le lendemain.
 */

export const JOURNAL = {
  /** Jours gardes, au plus. */
  maxDays: 120,
  /** Jours montres dans le tableau. */
  shownDays: 14,
} as const;

export interface JournalModelEntry {
  readonly model: ModelId;
  /** Erreur absolue moyenne de la temperature prevue la veille, °C. */
  readonly mae: number;
  /** Prevu moins mesure, en moyenne, °C. */
  readonly bias: number;
}

export interface JournalEntry {
  /** Jour examine, AAAA-MM-JJ, calendrier de Paris. */
  readonly date: string;
  readonly stationName: string;
  /** Heures de mesure de la station ce jour-la. */
  readonly hours: number;
  readonly observedMin: number;
  readonly observedMax: number;
  /** Du plus proche au plus eloigne de la mesure. */
  readonly models: readonly JournalModelEntry[];
}

/** L'entree de journal d'un bilan d'hier. */
export function journalEntryFrom(review: YesterdayReview, stationName: string): JournalEntry {
  return {
    date: review.date,
    stationName,
    hours: review.hours,
    observedMin: review.observedMin,
    observedMax: review.observedMax,
    models: review.models.map(({ model, mae, bias }) => ({ model, mae, bias })),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Entree lue d'un enregistrement : un enregistrement abime ne doit jamais casser le journal. */
export function isJournalEntry(value: unknown): value is JournalEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.stationName === 'string' &&
    isFiniteNumber(entry.hours) &&
    isFiniteNumber(entry.observedMin) &&
    isFiniteNumber(entry.observedMax) &&
    Array.isArray(entry.models) &&
    entry.models.every((m: unknown) => {
      const model = m as Record<string, unknown> | null;
      return (
        model !== null &&
        typeof model === 'object' &&
        (MODEL_ORDER as readonly unknown[]).includes(model.model) &&
        isFiniteNumber(model.mae) &&
        isFiniteNumber(model.bias)
      );
    })
  );
}

/**
 * Ajoute l'entree au journal lu (celle du meme jour est remplacee), du plus
 * recent au plus ancien, `maxDays` jours au plus. Les entrees illisibles sont
 * ecartees.
 */
export function mergeJournal(
  existing: unknown,
  entry: JournalEntry,
  maxDays: number = JOURNAL.maxDays,
): readonly JournalEntry[] {
  const kept = (Array.isArray(existing) ? existing : []).filter(
    (candidate): candidate is JournalEntry =>
      isJournalEntry(candidate) && candidate.date !== entry.date,
  );
  return [entry, ...kept].sort((a, b) => b.date.localeCompare(a.date)).slice(0, maxDays);
}

export interface JournalSummary {
  readonly days: number;
  /** Premier et dernier jours du journal. */
  readonly from: string;
  readonly to: string;
  /** Modeles par nombre de jours ou ils ont ete les plus proches de la mesure, du plus au moins. */
  readonly leaders: readonly { readonly model: ModelId; readonly wins: number }[];
  /** Erreur moyenne de chaque modele sur les jours ou il est note, du plus juste au moins juste. */
  readonly meanMae: readonly {
    readonly model: ModelId;
    readonly mae: number;
    readonly days: number;
  }[];
}

/** Bilan du journal, ou null quand il est vide. */
export function summarizeJournal(entries: readonly JournalEntry[]): JournalSummary | null {
  const first = entries.at(-1);
  const last = entries[0];
  if (first === undefined || last === undefined) {
    return null;
  }
  const wins = new Map<ModelId, number>();
  const errors = new Map<ModelId, number[]>();
  for (const entry of entries) {
    const leader = entry.models[0];
    if (leader !== undefined) {
      wins.set(leader.model, (wins.get(leader.model) ?? 0) + 1);
    }
    for (const { model, mae } of entry.models) {
      errors.set(model, [...(errors.get(model) ?? []), mae]);
    }
  }
  const order = (model: ModelId) => MODEL_ORDER.indexOf(model);
  return {
    days: entries.length,
    from: first.date,
    to: last.date,
    leaders: [...wins.entries()]
      .map(([model, count]) => ({ model, wins: count }))
      .sort((a, b) => b.wins - a.wins || order(a.model) - order(b.model)),
    meanMae: [...errors.entries()]
      .map(([model, values]) => ({
        model,
        mae: values.reduce((sum, v) => sum + v, 0) / values.length,
        days: values.length,
      }))
      .sort((a, b) => a.mae - b.mae || order(a.model) - order(b.model)),
  };
}
