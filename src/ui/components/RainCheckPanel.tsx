import type { StationReport } from '../../data/repository';
import type { RainCheck } from '../../domain/rainCheck';
import type { DatasetState } from '../hooks/useDataset';
import {
  forecastRainSentence,
  observedRainSentence,
  rainVerdictSentence,
} from '../rainPresentation';
import styles from './RainCheckPanel.module.css';

interface RainCheckPanelProps {
  readonly state: DatasetState<StationReport>;
  readonly check: RainCheck | null;
}

/** Phrase d'etat quand aucun cumul n'est possible, ou null s'il l'est. */
function unavailableSentence(state: DatasetState<StationReport>): string | null {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return 'Lecture des mesures de pluie…';
    case 'error':
      return 'Pluie tombée indisponible pour l’instant.';
    case 'ready':
      return state.value.match === null
        ? 'Pas de station de mesure représentative pour ce lieu : pas de cumul de pluie.'
        : null;
  }
}

/**
 * Pluie reellement tombee sur les dernieres 24 heures. Deux chiffres, chacun
 * avec sa provenance : mesure de la station (observed) et calcul du modele
 * retenu au lieu (forecast).
 */
export function RainCheckPanel({ state, check }: RainCheckPanelProps) {
  const unavailable = unavailableSentence(state);
  if (unavailable !== null || state.status !== 'ready') {
    return <p className={styles.muted}>{unavailable}</p>;
  }
  const match = state.value.match;
  const station = match?.station.name ?? 'la station';
  if (check === null || match === null) {
    return (
      <p className={styles.muted}>
        La station {station} n’a pas assez de mesures de pluie sur les 24 dernières heures, ou le
        modèle retenu manque : pas de cumul à comparer. Certaines stations ne publient pas de cumul
        horaire.
      </p>
    );
  }
  return (
    <div className={styles.panel}>
      <ul className={styles.figures}>
        <li data-provenance="observed">
          <span className={styles.pastille} aria-hidden="true" />
          <span className="visually-hidden">Mesuré. </span>
          {observedRainSentence(check, station, match.distanceKm)}
        </li>
        <li data-provenance="forecast">
          <span className={styles.pastille} aria-hidden="true" />
          <span className="visually-hidden">Calculé par le modèle. </span>
          {forecastRainSentence(check)}
        </li>
      </ul>
      <p className={styles.headline}>{rainVerdictSentence(check)}</p>
      <p className={styles.caption}>
        Seules les heures où la station et le modèle ont chacun une valeur sont comptées, des deux
        côtés : une heure sans mesure n’est jamais un zéro. La station est à quelques kilomètres du
        lieu, et une averse y passe ou non : l’écart n’est pas une erreur du modèle à lui seul.
      </p>
    </div>
  );
}
