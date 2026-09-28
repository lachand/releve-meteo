import type { PhenomenonEpisode, PhenomenonKind } from '../../domain/phenomena';
import {
  PHENOMENON_LABELS,
  PHENOMENON_SYMBOL,
  RISK_LABELS,
  episodePeriod,
  episodeSource,
  evidenceSentence,
} from '../phenomenaPresentation';
import { FrostPicto, HeatPicto, WeatherSymbol, WindPicto } from '../symbols/WeatherSymbol';
import styles from './PhenomenaPanel.module.css';

function Glyph({ kind }: { readonly kind: PhenomenonKind }) {
  const code = PHENOMENON_SYMBOL[kind];
  if (code !== null) {
    return <WeatherSymbol code={code} size={32} decorative />;
  }
  if (kind === 'strongWind') {
    return <WindPicto size={32} />;
  }
  return kind === 'frost' ? <FrostPicto size={32} /> : <HeatPicto size={32} />;
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
              <Glyph kind={episode.kind} />
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
