import type { CSSProperties } from 'react';
import { dailyLeaders } from '../../domain/reliability';
import type { DailyError } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { calendarCells, cellSentence, leaderTally } from '../calendarPresentation';
import { MODEL_CODES, MODEL_LABELS } from '../modelLabels';
import { modelColorVar } from '../modelPresentation';
import styles from './ReliabilityCalendar.module.css';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

interface ReliabilityCalendarProps {
  readonly rows: readonly { readonly model: ModelId; readonly daily: readonly DailyError[] }[];
}

/**
 * Calendrier de verification : pour chacun des 30 derniers jours, le modele
 * dont la temperature prevue la veille a le mieux colle a la station. Le nom
 * de chaque modele est ecrit dans la case (code de deux lettres) et dans sa
 * phrase : la couleur n'est jamais seule a porter l'information.
 */
export function ReliabilityCalendar({ rows }: ReliabilityCalendarProps) {
  const { cells, offset } = calendarCells(dailyLeaders(rows));
  const tally = leaderTally(cells);
  if (cells.length === 0 || tally.length === 0) {
    return null;
  }
  return (
    <div className={styles.calendar}>
      <h5 className={styles.heading}>Le plus juste, jour par jour</h5>
      <ol className={styles.grid} aria-label="Modèle le plus juste chaque jour, sur 30 jours">
        {WEEKDAYS.map((weekday, index) => (
          <li key={`h${index}`} className={styles.weekday} aria-hidden="true">
            {weekday}
          </li>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <li key={`o${index}`} className={styles.blank} aria-hidden="true" />
        ))}
        {cells.map((cell) => (
          <li
            key={cell.date}
            className={styles.cell}
            data-vide={cell.leader === null || undefined}
            style={
              cell.leader === null
                ? undefined
                : ({ '--model': modelColorVar(cell.leader.model) } as CSSProperties)
            }
            aria-label={cellSentence(cell)}
          >
            <span className={styles.day} aria-hidden="true">
              {cell.day}
            </span>
            <span className={styles.code} aria-hidden="true">
              {cell.leader === null ? '–' : MODEL_CODES[cell.leader.model]}
            </span>
          </li>
        ))}
      </ol>
      <ul className={styles.tally} aria-label="Jours gagnés par modèle">
        {tally.map(({ model, days }) => (
          <li key={model} style={{ '--model': modelColorVar(model) } as CSSProperties}>
            <span className={styles.swatch} aria-hidden="true" />
            <strong>{MODEL_CODES[model]}</strong> {MODEL_LABELS[model]} : {days}{' '}
            {days > 1 ? 'jours' : 'jour'}
          </li>
        ))}
      </ul>
      <p className={styles.caption}>
        Un jour est gagné par le modèle dont l’erreur moyenne de température, prévue la veille, a
        été la plus basse face à la station ; une case vide manque de mesures. Un modèle qui gagne
        souvent n’est pas forcément le plus juste en moyenne : voir l’erreur moyenne ci-dessus.
      </p>
    </div>
  );
}
