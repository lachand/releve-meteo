import type { DayLeader } from '../domain/reliability';
import { formatDayMonth, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelLabels';

/** Jours du calendrier de verification. */
export const CALENDAR_DAYS = 30;

export interface CalendarCell {
  /** Date 'AAAA-MM-JJ'. */
  readonly date: string;
  /** Quantieme, sans zero initial. */
  readonly day: number;
  readonly leader: DayLeader | null;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/** Lundi = 0 ... dimanche = 6, pour la grille d'une semaine commencant le lundi. */
function weekdayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const jsDay = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  return (jsDay + 6) % 7;
}

/**
 * Les `CALENDAR_DAYS` derniers jours jusqu'a la date la plus recente, un jour
 * sans plus juste (donnees insuffisantes) restant une case vide : jamais un
 * modele invente. `offset` : cases vides avant le premier jour, pour que la
 * grille commence un lundi.
 */
export function calendarCells(leaders: readonly DayLeader[]): {
  readonly cells: readonly CalendarCell[];
  readonly offset: number;
} {
  const last = leaders.at(-1);
  if (last === undefined) {
    return { cells: [], offset: 0 };
  }
  const byDate = new Map(leaders.map((leader) => [leader.date, leader]));
  const first = addDays(last.date, -(CALENDAR_DAYS - 1));
  const cells = Array.from({ length: CALENDAR_DAYS }, (_, index): CalendarCell => {
    const date = addDays(first, index);
    return { date, day: Number(date.slice(8, 10)), leader: byDate.get(date) ?? null };
  });
  return { cells, offset: weekdayIndex(first) };
}

/** « 26 septembre : ARPEGE le plus juste (0,5 °C), 0,4 °C devant le suivant, 4 modèles comparés. » */
export function cellSentence(cell: CalendarCell): string {
  const date = formatDayMonth(cell.date);
  const { leader } = cell;
  if (leader === null) {
    return `${date} : pas assez de mesures pour désigner le plus juste.`;
  }
  const margin =
    leader.lead === 0
      ? 'à égalité avec le suivant'
      : `${formatOneDecimal(leader.lead)}\u00a0°C devant le suivant`;
  return `${date} : ${MODEL_LABELS[leader.model]} le plus juste (${formatOneDecimal(leader.mae)}\u00a0°C d’erreur), ${margin}, ${leader.compared} modèles comparés.`;
}

/** Combien de jours chaque modele a-t-il ete le plus juste, du plus frequent au moins frequent. */
export function leaderTally(
  cells: readonly CalendarCell[],
): readonly { readonly model: DayLeader['model']; readonly days: number }[] {
  const counts = new Map<DayLeader['model'], number>();
  for (const { leader } of cells) {
    if (leader !== null) {
      counts.set(leader.model, (counts.get(leader.model) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([model, days]) => ({ model, days }))
    .sort((a, b) => b.days - a.days);
}
