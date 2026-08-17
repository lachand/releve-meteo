import type { DailyPoint } from '../../domain/types';
import { weatherCodeLabel } from '../weatherCodePresentation';
import styles from './SevenDayView.module.css';

interface SevenDayViewProps {
  readonly days: readonly DailyPoint[];
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: 'numeric',
});

function formatDay(date: string): string {
  const formatted = dayFormatter.format(new Date(`${date}T12:00:00Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function SevenDayView({ days }: SevenDayViewProps) {
  if (days.length === 0) {
    return <p style={{ color: 'var(--encre-faible)' }}>Aucune prevision quotidienne disponible.</p>;
  }

  // Le maximum ne sert qu'a mettre les barres a l'echelle : une precipitation
  // absente (null) est exclue plutot que traitee comme 0, jamais affichee
  // telle quelle par ailleurs.
  const knownPrecipitations = days
    .map((day) => day.precipitationSum.value)
    .filter((value): value is number => value !== null);
  const maxPrecipitation = Math.max(0.1, ...knownPrecipitations);

  return (
    <ul className={styles.list}>
      {days.map((day) => {
        const precipitation = day.precipitationSum.value;
        const barHeight = precipitation === null ? 0 : (precipitation / maxPrecipitation) * 100;
        return (
          <li key={day.date} className={styles.row}>
            <span className={styles.day}>{formatDay(day.date)}</span>
            <span className={styles.barTrack} aria-hidden="true">
              <span className={styles.bar} style={{ height: `${barHeight}%` }} />
            </span>
            <span className={styles.condition}>{weatherCodeLabel(day.weatherCode) ?? ''}</span>
            <span className={styles.range} data-donnee>
              {day.tempMax.value === null ? '—' : `${Math.round(day.tempMax.value)}°`}
              {' / '}
              <span className={styles.min}>
                {day.tempMin.value === null ? '—' : `${Math.round(day.tempMin.value)}°`}
              </span>
            </span>
            <span className={styles.precipitation} data-donnee>
              {precipitation === null ? '—' : `${precipitation.toFixed(1)} mm`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
