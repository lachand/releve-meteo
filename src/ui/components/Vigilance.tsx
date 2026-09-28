import type { VigilanceReport } from '../../data/repository';
import type { VigilanceLevel, VigilancePhenomenon, VigilanceSummary } from '../../domain/vigilance';
import type { DatasetState } from '../hooks/useDataset';
import {
  VIGILANCE_LEVEL_MEANINGS,
  VIGILANCE_LEVEL_WORDS,
  VIGILANCE_PHENOMENON_LABELS,
  bulletinTimePhrase,
  vigilancePeriodPhrase,
} from '../vigilancePresentation';
import styles from './Vigilance.module.css';

/*
 * Vigilance officielle de Meteo-France. Deux formes : un bandeau en tete
 * du releve des qu'un phenomene est en jaune ou au-dela, et une ligne
 * sous « Phenomenes a surveiller » qui dit toujours ou en est le
 * departement, vert compris. La vigilance est une expertise de
 * previsionnistes, pas un calcul de Relevé : l'interface le dit.
 */

export const VIGILANCE_MAP_URL = 'https://vigilance.meteofrance.fr/fr';

type VigilanceState = DatasetState<VigilanceReport>;

function departmentLabel(department: { readonly code: string; readonly name: string }): string {
  return `${department.name} (${department.code})`;
}

/** « Orange orages ». */
function warningTitle(level: VigilanceLevel, phenomenon: VigilancePhenomenon): string {
  const word = VIGILANCE_LEVEL_WORDS[level];
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${VIGILANCE_PHENOMENON_LABELS[phenomenon]}`;
}

/** Carre a la couleur officielle du niveau, toujours accompagne du mot. */
function Swatch({ level }: { readonly level: VigilanceLevel }) {
  return <span className={styles.swatch} data-level={level} aria-hidden="true" />;
}

interface VigilanceProps {
  readonly state: VigilanceState;
  readonly summary: VigilanceSummary | null;
  readonly now: Date;
}

/** Bandeau des vigilances jaunes a rouges du departement. Rien sinon. */
export function VigilanceBanner({ state, summary, now }: VigilanceProps) {
  if (state.status !== 'ready' || summary === null || summary.warnings.length === 0) {
    return null;
  }
  const { department, bulletin } = state.value;
  // Un resume n'existe que pour un bulletin : garde pour le typage seulement.
  /* v8 ignore next 3 */
  if (department === null || bulletin === null) {
    return null;
  }
  return (
    <section
      className={styles.banner}
      data-level={summary.maxLevel}
      aria-labelledby="vigilance-titre"
    >
      <h2 id="vigilance-titre" className={styles.bannerTitle}>
        <Swatch level={summary.maxLevel} />
        Vigilance {VIGILANCE_LEVEL_WORDS[summary.maxLevel]} · {departmentLabel(department)}
      </h2>
      <ul className={styles.warnings}>
        {summary.warnings.map((warning) => (
          <li
            key={`${warning.phenomenon}-${warning.level}-${warning.beginUtcMs}-${warning.coastal}`}
          >
            <Swatch level={warning.level} />
            <span>
              <strong>{warningTitle(warning.level, warning.phenomenon)}</strong>
              {warning.coastal ? ', sur le littoral' : ''} : {vigilancePeriodPhrase(warning, now)}
              <span className={styles.meaning}> ({VIGILANCE_LEVEL_MEANINGS[warning.level]})</span>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.source}>
        Vigilance officielle de Météo-France, établie par ses prévisionnistes pour tout le
        département, pas un calcul de Relevé. Bulletin de{' '}
        {bulletinTimePhrase(bulletin.issuedUtcMs, now)}
        {state.stale ? ', copie enregistrée : le réseau ne répond pas' : ''}.{' '}
        <a href={VIGILANCE_MAP_URL} target="_blank" rel="noreferrer">
          Carte officielle
        </a>
      </p>
      {summary.stale ? (
        <p className={styles.stale}>
          Ce bulletin date de plus d’un jour : il n’a peut-être pas été renouvelé ici. Vérifiez la
          carte officielle.
        </p>
      ) : null}
    </section>
  );
}

/** Etat de la vigilance du departement, en une ligne, vert compris. */
export function VigilanceLine({ state, summary, now }: VigilanceProps) {
  let text: string;
  if (state.status === 'idle' || state.status === 'loading') {
    text = 'Vigilance Météo-France : chargement…';
  } else if (state.status === 'error') {
    text = 'Vigilance Météo-France indisponible pour l’instant : consultez la carte officielle.';
  } else if (state.value.department === null || state.value.bulletin === null || summary === null) {
    text = 'Pas de vigilance départementale pour ce lieu, hors de France métropolitaine.';
  } else if (summary.warnings.length === 0) {
    text = `Vigilance Météo-France : verte pour ${departmentLabel(state.value.department)}, aujourd’hui et demain (bulletin de ${bulletinTimePhrase(state.value.bulletin.issuedUtcMs, now)}).`;
  } else {
    text = `Vigilance Météo-France ${VIGILANCE_LEVEL_WORDS[summary.maxLevel]} pour ${departmentLabel(state.value.department)} : détail en tête du relevé.`;
  }
  const level = state.status === 'ready' && summary !== null ? summary.maxLevel : null;
  return (
    <p className={styles.line}>
      {level === null ? null : <Swatch level={level} />}
      <span>
        {text}{' '}
        <a href={VIGILANCE_MAP_URL} target="_blank" rel="noreferrer">
          Carte officielle
        </a>
      </span>
    </p>
  );
}
