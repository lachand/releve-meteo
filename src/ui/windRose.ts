import type { ForecastBundle } from '../domain/types';
import type { CascadeView } from './hooks/useCascadeView';

export interface WindRoseBucket {
  readonly direction: string;
  readonly count: number;
}

// Points cardinaux en francais, DESIGN.md n'imposant pas de convention
// anglaise pour cet affichage.
const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

function bucketIndex(degrees: number): number {
  return Math.round(degrees / 45) % DIRECTIONS.length;
}

/**
 * Repartit la direction du vent par secteur de 45 degres sur la fenetre
 * [start, end). Une heure sans direction connue est ignoree, jamais comptee
 * dans un secteur par defaut.
 */
export function windRoseBuckets(
  bundle: ForecastBundle,
  cascade: CascadeView,
  start: number,
  end: number,
): readonly WindRoseBucket[] {
  const counts = new Array<number>(DIRECTIONS.length).fill(0);
  const boundedEnd = Math.min(end, bundle.timeline.length);
  for (let i = start; i < boundedEnd; i += 1) {
    const segment = cascade.segments.find((s) => i >= s.startIndex && i <= s.endIndex);
    const hourly = segment ? bundle.series[segment.model]?.hourly[i] : undefined;
    const degrees = hourly?.windDirection.value ?? null;
    if (degrees === null) {
      continue;
    }
    const index = bucketIndex(degrees);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return DIRECTIONS.map((direction, index) => ({ direction, count: counts[index] ?? 0 }));
}
