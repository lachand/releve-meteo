import type { PhenomenonEpisode, PhenomenonKind } from '../../domain/phenomena';
import {
  PHENOMENON_LABELS,
  PHENOMENON_SYMBOL,
  RISK_LABELS,
  episodePeriod,
  episodeSource,
  evidenceSentence,
} from '../phenomenaPresentation';
import { WeatherSymbol } from '../symbols/WeatherSymbol';
import { WindBarb } from '../symbols/WindBarb';
import styles from './PhenomenaPanel.module.css';

function Glyph({ kind, peak }: { readonly kind: PhenomenonKind; readonly peak: number | null }) {
  const code = PHENOMENON_SYMBOL[kind];
  if (code !== null) {
    return <WeatherSymbol code={code} size={32} decorative />;
  }
  if (kind === 'strongWind') {
    return <WindBarb speedKmh={peak} directionDeg={270} size={32} />;
  }
  // Gel : cristal a six branches ; chaleur : disque solaire rayonnant.
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      aria-hidden="true"
    >
      {kind === 'frost' ? (
        <path d="M16 5 V27 M6.5 10.5 L25.5 21.5 M6.5 21.5 L25.5 10.5 M13 7.5 L16 10 L19 7.5 M13 24.5 L16 22 L19 24.5" />
      ) : (
        <>
          <circle cx={16} cy={16} r={5.5} />
          <path d="M16 4 V7.5 M16 24.5 V28 M4 16 H7.5 M24.5 16 H28 M7.5 7.5 L10 10 M22 22 L24.5 24.5 M7.5 24.5 L10 22 M22 10 L24.5 7.5" />
        </>
      )}
    </svg>
  );
}

interface PhenomenaPanelProps {
  readonly episodes: readonly PhenomenonEpisode[];
  readonly horizonHours: number;
}

export function PhenomenaPanel({ episodes, horizonHours }: PhenomenaPanelProps) {
  if (episodes.length === 0) {
    return (
      <p className={styles.calm}>
        Aucun phénomène notable prévu sur {horizonHours} heures : ni orage, ni forte pluie, ni
        neige, ni gel, ni brouillard, ni vent fort, ni chaleur.
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {episodes.map((episode) => {
        const source = episodeSource(episode);
        return (
          <li
            key={`${episode.kind}-${episode.start}`}
            className={styles.item}
            data-level={episode.level}
          >
            <span className={styles.glyph}>
              <Glyph kind={episode.kind} peak={episode.evidence.peakValue} />
            </span>
            <div className={styles.body}>
              <p className={styles.title}>
                {PHENOMENON_LABELS[episode.kind]}
                <span className={styles.level}>risque {RISK_LABELS[episode.level]}</span>
              </p>
              <p className={styles.period}>{episodePeriod(episode)}</p>
              <p className={styles.evidence}>
                {evidenceSentence(episode)}
                {source !== null && <span className={styles.source}> {source}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
