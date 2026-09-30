import type { PracticalIndices } from '../../domain/practicalIndices';
import type { Preferences } from '../../domain/types';
import {
  INDEX_LABELS,
  VERDICT_WORDS,
  criterionSentence,
  windowSentence,
} from '../practicalPresentation';
import styles from './PracticalIndicesPanel.module.css';

interface PracticalIndicesPanelProps {
  readonly indices: PracticalIndices;
  readonly windUnit: Preferences['units']['wind'];
}

/**
 * Velo, randonnee, linge, jardinage : un verdict en mots, et pour chacun les
 * criteres, la valeur lue et les seuils, un indice a la fois depliable.
 */
export function PracticalIndicesPanel({ indices, windUnit }: PracticalIndicesPanelProps) {
  return (
    <div className={styles.panel}>
      <p className={styles.window}>{windowSentence(indices)}</p>
      <ul className={styles.list}>
        {indices.indices.map((index) => (
          <li key={index.id} data-verdict={index.verdict}>
            <details className={styles.item}>
              <summary className={styles.summary}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.name}>{INDEX_LABELS[index.id]}</span>
                <span className={styles.verdict}>{VERDICT_WORDS[index.verdict]}</span>
              </summary>
              <ul className={styles.criteria}>
                {index.criteria.map((criterion) => (
                  <li key={criterion.key} data-status={criterion.status}>
                    {criterionSentence(criterion, windUnit)}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Des repères d’usage, pas des normes. Le pire critère décide ; une heure sans valeur rend
        l’indice indéterminé.
      </p>
    </div>
  );
}
