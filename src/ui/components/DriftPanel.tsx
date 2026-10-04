import { dayDriftSentence, driftHeadline } from '../driftPresentation';
import type { DriftState } from '../hooks/useForecastDrift';
import styles from './DriftPanel.module.css';

/**
 * « La prevision a bouge » : ce que Relevé annoncait hier face a ce qu'il annonce
 * maintenant. La prevision de la veille est celle que cet appareil a gardee :
 * sans elle, rien n'est compare, et le panneau le dit.
 */
export function DriftPanel({ state }: { readonly state: DriftState }) {
  if (state.status === 'idle' || state.status === 'loading') {
    return null;
  }
  if (state.status === 'collecting') {
    return (
      <p className={styles.muted}>
        Relevé garde la prévision de chaque lieu sur cet appareil pour la comparer le lendemain : la
        comparaison apparaîtra dès qu’une prévision aura été gardée la veille, vers la même heure.
      </p>
    );
  }
  const { drift, now } = state;
  return (
    <div className={styles.panel}>
      <p className={styles.headline}>{driftHeadline(drift, now)}</p>
      {drift.moved.length > 0 && (
        <ul className={styles.list} aria-label="Jours dont la prévision a bougé">
          {drift.moved.map((day) => (
            <li key={day.date}>{dayDriftSentence(day)}</li>
          ))}
        </ul>
      )}
      <p className={styles.caption}>
        Comparaison avec la prévision que cet appareil avait gardée, du modèle retenu chaque jour.
        Un jour de plus ou de moins dans la prévision n’est pas un écart.
      </p>
    </div>
  );
}
