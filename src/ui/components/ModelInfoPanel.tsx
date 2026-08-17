import { confidenceAt, dispersionAt } from '../../domain/confidence';
import type { ConfidenceLevel } from '../../domain/types';
import type { ForecastBundle, ModelId, TerrainProfile } from '../../domain/types';
import { cascadeBoundHours, explainActiveModel } from '../modelExplanation';
import {
  CONFIDENCE_LEVEL_LABELS,
  MODEL_LABELS,
  MODEL_PRODUCERS,
  MODEL_RESOLUTIONS,
} from '../modelPresentation';
import styles from './ModelInfoPanel.module.css';

interface ModelInfoPanelProps {
  readonly bundle: ForecastBundle;
  readonly nowIndex: number;
  readonly activeModel: ModelId;
  readonly available: readonly ModelId[];
  readonly terrain: TerrainProfile;
  readonly onCompareClick: () => void;
}

const numberFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

// "Ecart entre modeles" se lit comme une taille d'ecart, pas comme un
// niveau de confiance : une confiance elevee est un ecart faible.
const SPREAD_WORDS: Readonly<Record<ConfidenceLevel, string>> = {
  high: 'faible',
  medium: 'modéré',
  low: 'élevé',
  unavailable: '—',
};

export function ModelInfoPanel({
  bundle,
  nowIndex,
  activeModel,
  available,
  terrain,
  onCompareClick,
}: ModelInfoPanelProps) {
  const confidence = confidenceAt(bundle, nowIndex, terrain);
  const temperatureSpread = dispersionAt(bundle, nowIndex, 'temperature');
  const windSpread = dispersionAt(bundle, nowIndex, 'wind');
  const precipitationLevel = confidence.byVariable.precipitation;

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h2>Modèle actif</h2>
        <p className={styles.modelName}>
          {MODEL_LABELS[activeModel]} {MODEL_RESOLUTIONS[activeModel]}
        </p>
        <p className={styles.modelMeta}>{MODEL_PRODUCERS[activeModel]}</p>
        <p className={styles.modelMeta}>échéance jusqu'à {cascadeBoundHours(activeModel)} h</p>
        <p className={styles.explanation}>{explainActiveModel(activeModel, 0, available)}</p>
      </section>

      <section className={styles.section}>
        <h2>Confiance</h2>
        <p className={styles.confidenceLevel}>{CONFIDENCE_LEVEL_LABELS[confidence.level]}</p>
        <table className={styles.spreadTable}>
          <caption>Écart max entre modèles</caption>
          <tbody>
            <tr>
              <td>température</td>
              <td>
                {temperatureSpread === null
                  ? '—'
                  : `${numberFr.format(temperatureSpread.spread)} °C`}
              </td>
            </tr>
            <tr>
              <td>vent</td>
              <td>{windSpread === null ? '—' : `${numberFr.format(windSpread.spread)} km/h`}</td>
            </tr>
            <tr>
              <td>précipitations</td>
              <td>{precipitationLevel === undefined ? '—' : SPREAD_WORDS[precipitationLevel]}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <button type="button" className={styles.compareButton} onClick={onCompareClick}>
        Comparer les modèles
      </button>
    </div>
  );
}
