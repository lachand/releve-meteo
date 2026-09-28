import type { CSSProperties } from 'react';
import { MODEL_ORDER, MODEL_SPECS } from '../../domain/models';
import type { ModelRanking } from '../../domain/modelSelection';
import type { ModelVerification } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { formatInteger, formatOneDecimal } from '../format';
import { MODEL_LABELS, modelColorVar, modelResolution } from '../modelPresentation';
import { INELIGIBILITY_LABELS, localTemperatureError } from '../selectionExplanation';
import styles from './ModelChooser.module.css';

interface ModelChooserProps {
  readonly preferred: ModelId | null;
  readonly onChange: (model: ModelId | null) => void;
  readonly ranking: readonly ModelRanking[];
  readonly verification: readonly ModelVerification[];
  readonly automaticModel: ModelId | null;
}

/**
 * Choix du modèle de référence : automatique (recommandé) ou un modèle
 * précis, chacun présenté avec ses points forts, ses points faibles, sa
 * portée et son erreur mesurée ici. Au-delà de la portée du modèle choisi,
 * la sélection automatique reprend la main, transition visible.
 */
export function ModelChooser({
  preferred,
  onChange,
  ranking,
  verification,
  automaticModel,
}: ModelChooserProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Modèle de référence pour ce lieu</legend>
      <label className={styles.card} data-checked={preferred === null || undefined}>
        <input
          type="radio"
          name="model-choice"
          value="auto"
          checked={preferred === null}
          onChange={() => onChange(null)}
          className={styles.radio}
        />
        <span className={styles.cardBody}>
          <span className={styles.title}>
            Automatique <span className={styles.recommended}>recommandé</span>
          </span>
          <span className={styles.summary}>
            Le meilleur modèle à chaque échéance, d’après la maille, le terrain et l’erreur mesurée
            ici.
            {automaticModel !== null && <> En ce moment : {MODEL_LABELS[automaticModel]}.</>}
          </span>
        </span>
      </label>
      {MODEL_ORDER.map((model) => {
        const spec = MODEL_SPECS[model];
        const row = ranking.find((r) => r.model === model);
        const available =
          row?.ineligibility !== 'unavailable' && row?.ineligibility !== 'outOfDomain';
        const mae = localTemperatureError(verification, model);
        return (
          <label
            key={model}
            className={styles.card}
            data-checked={preferred === model || undefined}
            data-disabled={!available || undefined}
            style={{ '--model': modelColorVar(model) } as CSSProperties}
          >
            <input
              type="radio"
              name="model-choice"
              value={model}
              checked={preferred === model}
              disabled={!available}
              onChange={() => onChange(model)}
              className={styles.radio}
            />
            <span className={styles.cardBody}>
              <span className={styles.title}>
                <span className={styles.swatch} aria-hidden="true" />
                {MODEL_LABELS[model]}
                <span className={styles.meta}>
                  {spec.producer} · {modelResolution(model)} · {formatInteger(spec.maxLeadHours)} h
                </span>
              </span>
              {!available && row?.ineligibility != null && (
                <span className={styles.unavailable}>
                  Indisponible : {INELIGIBILITY_LABELS[row.ineligibility]}.
                </span>
              )}
              <span className={styles.lists}>
                <span className={styles.pros}>
                  {spec.strengths.map((text) => (
                    <span key={text} className={styles.pro}>
                      {text}
                    </span>
                  ))}
                </span>
                <span className={styles.cons}>
                  {spec.weaknesses.map((text) => (
                    <span key={text} className={styles.con}>
                      {text}
                    </span>
                  ))}
                </span>
              </span>
              {mae !== null && (
                <span className={styles.measured}>
                  Erreur mesurée ici sur la température à J+1 : {formatOneDecimal(mae)} °C
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
