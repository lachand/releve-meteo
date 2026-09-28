import type { CSSProperties } from 'react';
import type { ForecastBundle } from '../../domain/types';
import { formatDayShort, formatHour } from '../format';
import type { CascadeView } from '../hooks/useCascadeView';
import { MODEL_LABELS, modelColorVar } from '../modelPresentation';
import styles from './CascadeFrieze.module.css';

interface CascadeFriezeProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
}

/**
 * Frise de la cascade : quel modèle parle, à quelle échéance, avec les
 * bascules marquées. Largeur proportionnelle à la durée de chaque tronçon.
 */
export function CascadeFrieze({ bundle, cascade }: CascadeFriezeProps) {
  const segments = cascade.segments;
  const first = segments[0];
  const last = segments.at(-1);
  if (first === undefined || last === undefined) {
    return <p className={styles.empty}>Aucune échéance couverte.</p>;
  }
  const total = last.endIndex - first.startIndex + 1;
  const dayStarts: { index: number; label: string }[] = [];
  for (let i = first.startIndex; i <= last.endIndex; i += 1) {
    const time = bundle.timeline[i];
    if (time !== undefined && time.endsWith('T00:00')) {
      dayStarts.push({ index: i, label: formatDayShort(time) });
    }
  }
  return (
    <figure className={styles.figure}>
      <ol className={styles.bar} aria-label="Modèle retenu par échéance">
        {segments.map((segment) => {
          const hours = segment.endIndex - segment.startIndex + 1;
          const from = bundle.timeline[segment.startIndex] ?? '';
          const to = bundle.timeline[segment.endIndex] ?? '';
          return (
            <li
              key={`${segment.model}-${segment.startIndex}`}
              className={styles.segment}
              style={
                {
                  flexGrow: hours,
                  '--model': modelColorVar(segment.model),
                } as CSSProperties
              }
            >
              <span className={styles.label}>{MODEL_LABELS[segment.model]}</span>
              <span className="visually-hidden">
                {' '}
                de {formatDayShort(from)} {formatHour(from)} à {formatDayShort(to)} {formatHour(to)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.ticks} aria-hidden="true">
        {dayStarts.map((tick) => (
          <span
            key={tick.index}
            className={styles.tick}
            style={{ left: `${((tick.index - first.startIndex) / total) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
