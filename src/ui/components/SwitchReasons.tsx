import type { LocalIsoHour } from '../../domain/types';
import type { CascadeSwitch } from '../cascadeView';
import { formatDayShort, formatHour } from '../format';
import { switchSentence } from '../selectionExplanation';
import styles from './SwitchReasons.module.css';

interface SwitchReasonsProps {
  readonly timeline: readonly LocalIsoHour[];
  readonly switches: readonly CascadeSwitch[];
  readonly title: string;
}

/**
 * Pourquoi la cascade change de modele : une phrase par bascule, avec le
 * critere qui a le plus pese. Le raccord n'est jamais lisse en silence, et
 * sa raison est dite a cote de lui.
 */
export function SwitchReasons({ timeline, switches, title }: SwitchReasonsProps) {
  if (switches.length === 0) {
    return null;
  }
  return (
    <section className={styles.reasons} aria-label={title}>
      <h4 className={styles.title}>{title}</h4>
      {switches.map((entry) => {
        const time = timeline[entry.index] ?? '';
        return (
          <p key={entry.index} className={styles.reason}>
            <strong className={styles.when}>
              {formatDayShort(time)} {formatHour(time)}
            </strong>{' '}
            {switchSentence(entry)}
          </p>
        );
      })}
    </section>
  );
}
