import type { StationReport } from '../../data/repository';
import type { YesterdayReview } from '../../domain/yesterdayReview';
import type { ModelId } from '../../domain/types';
import { formatOneDecimal, formatSignedOneDecimal } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { MODEL_LABELS } from '../modelPresentation';
import { yesterdayHeadline } from '../yesterdayPresentation';
import styles from './YesterdayPanel.module.css';

interface YesterdayPanelProps {
  readonly state: DatasetState<StationReport>;
  readonly review: YesterdayReview | null;
  readonly activeModel: ModelId | null;
}

/** Phrase d'etat quand aucun bilan n'est possible, ou null s'il l'est. */
function unavailableSentence(state: DatasetState<StationReport>): string | null {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return 'Lecture des mesures et des prévisions d’hier…';
    case 'error':
      return 'Bilan d’hier indisponible pour l’instant.';
    case 'ready':
      return state.value.match === null
        ? 'Pas de station de mesure représentative pour ce lieu : pas de bilan d’hier.'
        : null;
  }
}

/**
 * Hier, prevu contre reel. La prevision est celle de la veille
 * (`previous_day1`) au point de la station, la mesure vient de la station :
 * chaque ecart est celui d'un modele nomme, jamais d'un « modele moyen ».
 */
export function YesterdayPanel({ state, review, activeModel }: YesterdayPanelProps) {
  const unavailable = unavailableSentence(state);
  if (unavailable !== null || state.status !== 'ready') {
    return <p className={styles.muted}>{unavailable}</p>;
  }
  const station = state.value.match?.station.name ?? 'la station';
  if (review === null) {
    return (
      <p className={styles.muted}>
        La station {station} n’a pas assez de mesures d’hier, ou les prévisions de la veille
        manquent : pas de bilan.
      </p>
    );
  }
  const captionId = 'bilan-hier-legende';
  return (
    <div className={styles.panel}>
      <p className={styles.headline}>{yesterdayHeadline(review, station)}</p>
      <p id={captionId} className={styles.caption}>
        Température de chaque modèle telle qu’il la prévoyait la veille, au point et à l’altitude de
        la station, comparée à ce qui a été mesuré. Écart : prévu moins mesuré.
      </p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.scroller} role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className={styles.table} aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col">Modèle</th>
              <th scope="col">Écart moyen</th>
              <th scope="col">Erreur moyenne</th>
              <th scope="col">Mini</th>
              <th scope="col">Maxi</th>
            </tr>
          </thead>
          <tbody>
            {review.models.map((row) => (
              <tr key={row.model} data-active={row.model === activeModel ? '' : undefined}>
                <th scope="row" className={styles.model}>
                  {MODEL_LABELS[row.model]}
                </th>
                <td data-donnee>{formatSignedOneDecimal(row.bias)}&nbsp;°C</td>
                <td data-donnee>{formatOneDecimal(row.mae)}&nbsp;°C</td>
                <td data-donnee>{formatSignedOneDecimal(row.minGap)}&nbsp;°C</td>
                <td data-donnee>{formatSignedOneDecimal(row.maxGap)}&nbsp;°C</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.notes}>
        <li>
          Prévu : prévision émise la veille (Open-Meteo, « Previous Runs »). Mesuré : relevés
          Meteostat de la station, souvent arrondis au degré. Une heure sans l’un ou l’autre n’est
          pas comptée.
        </li>
        <li>
          Mini et maxi : plus bas et plus haut prévus moins plus bas et plus haut mesurés, sur les
          heures comparées.
        </li>
      </ul>
    </div>
  );
}
