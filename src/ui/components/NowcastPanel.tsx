import type { Nowcast } from '../../data/mappers/nowcastMapper';
import { NOWCAST_RAIN_MM, summarizeNowcast } from '../../domain/nowcast';
import { leadHoursFrom } from '../../domain/time';
import { formatHour } from '../format';
import { nowcastSentence } from '../nowcastPresentation';
import type { DatasetState } from '../hooks/useDataset';
import styles from './NowcastPanel.module.css';

interface NowcastPanelProps {
  readonly state: DatasetState<Nowcast>;
  readonly now: Date;
}

/** Échelle verticale : 2 mm par quart d'heure remplit la hauteur. */
const FULL_SCALE_MM = 2;

export function NowcastPanel({ state, now }: NowcastPanelProps) {
  if (state.status === 'idle') {
    return null;
  }
  if (state.status === 'loading') {
    return <div className={styles.skeleton} aria-busy="true" aria-label="Chargement du nowcast" />;
  }
  if (state.status === 'error') {
    return <p className={styles.muted}>Pluie au quart d’heure indisponible pour le moment.</p>;
  }
  const { times, precipitation } = state.value;
  const summary = summarizeNowcast(times, precipitation, now);
  const steps = times
    .map((time, index) => ({ time, value: precipitation[index] ?? null }))
    .filter((step) => leadHoursFrom(now, step.time) * 60 > -15);

  return (
    <div className={styles.panel}>
      <p className={styles.sentence}>{nowcastSentence(summary)}</p>
      <div className={styles.chart} role="img" aria-label="Pluie par quart d'heure sur deux heures">
        {steps.map((step) => {
          const value = step.value;
          const ratio = value === null ? 0 : Math.min(1, value / FULL_SCALE_MM);
          return (
            <div key={step.time} className={styles.step}>
              <span
                className={value !== null && value >= NOWCAST_RAIN_MM ? styles.barWet : styles.bar}
                style={{ height: `${Math.max(2, Math.round(ratio * 100))}%` }}
                data-missing={value === null || undefined}
              />
              <span className={styles.tick}>
                {step.time.endsWith(':00') ? formatHour(step.time) : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className={styles.source}>AROME 1,3 km, pas de 15 min</p>
    </div>
  );
}
