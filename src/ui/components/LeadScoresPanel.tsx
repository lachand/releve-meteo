import type { StationReport } from '../../data/repository';
import type { LeadScores } from '../../domain/leadScores';
import type { ModelId } from '../../domain/types';
import { formatOneDecimal, formatSignedOneDecimal } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { collectingSentence, leadHeadline } from '../leadPresentation';
import { MODEL_LABELS } from '../modelPresentation';
import styles from './YesterdayPanel.module.css';

interface LeadScoresPanelProps {
  readonly state: DatasetState<StationReport>;
  readonly scores: LeadScores | null;
  readonly activeModel: ModelId | null;
}

function unavailableSentence(state: DatasetState<StationReport>): string | null {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return 'Lecture des prévisions enregistrées…';
    case 'error':
      return 'Échéances courtes indisponibles pour l’instant.';
    case 'ready':
      return state.value.match === null
        ? 'Pas de station de mesure représentative pour ce lieu : pas de note des échéances courtes.'
        : null;
  }
}

/**
 * Echeances de 1 a 12 h, notees sur les instantanes que l'application a elle-meme
 * enregistres. Tant qu'il manque des paires : « en collecte », sans chiffre.
 */
export function LeadScoresPanel({ state, scores, activeModel }: LeadScoresPanelProps) {
  const unavailable = unavailableSentence(state);
  if (unavailable !== null || state.status !== 'ready' || scores === null) {
    return <p className={styles.muted}>{unavailable}</p>;
  }
  if (!scores.ready) {
    return <p className={styles.muted}>{collectingSentence(scores)}</p>;
  }
  const models = [
    ...new Set(scores.buckets.flatMap((bucket) => bucket.models.map((m) => m.model))),
  ];
  const captionId = 'echeances-courtes-legende';
  return (
    <div className={styles.panel}>
      <p className={styles.headline}>{leadHeadline(scores)}</p>
      <p id={captionId} className={styles.caption}>
        Erreur moyenne de la température de chaque modèle, prévue 1, 3, 6 et 12 h avant la mesure de
        la station, sur les prévisions que l’application a enregistrées. Entre parenthèses : le
        nombre d’heures comparées et l’écart moyen (prévu moins mesuré).
      </p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.scroller} role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className={styles.table} aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col">Modèle</th>
              {scores.buckets.map((bucket) => (
                <th key={bucket.label} scope="col">
                  À {bucket.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model} data-active={model === activeModel ? '' : undefined}>
                <th scope="row" className={styles.model}>
                  {MODEL_LABELS[model]}
                </th>
                {scores.buckets.map((bucket) => {
                  const cell = bucket.models.find((m) => m.model === model);
                  return (
                    <td key={bucket.label} data-donnee>
                      {cell === undefined ? (
                        '—'
                      ) : (
                        <>
                          {formatOneDecimal(cell.mae)}&nbsp;°C{' '}
                          <span className={styles.detail}>
                            ({cell.pairs}&nbsp;h, {formatSignedOneDecimal(cell.bias)})
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.notes}>
        <li>
          Une case vide, « — », veut dire moins de 6 heures comparables : pas assez pour noter ce
          modèle à cette échéance. {scores.snapshots} prévisions enregistrées sur cet appareil ; la
          collecte ne couvre que les heures où l’application a été ouverte.
        </li>
        <li>
          L’échéance est comptée depuis l’heure où l’application a lu la prévision, pas depuis
          l’initialisation du modèle.
        </li>
      </ul>
    </div>
  );
}
