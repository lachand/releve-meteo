import type { CSSProperties } from 'react';
import { MODEL_SPECS } from '../../domain/models';
import type { CriterionKind, ModelRanking as Ranking } from '../../domain/modelSelection';
import { SELECTION_WEIGHTS } from '../../domain/modelSelection';
import type { ModelVerification } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { MISSING, formatInteger, formatOneDecimal } from '../format';
import { MODEL_LABELS, modelColorVar, modelResolution } from '../modelPresentation';
import { INELIGIBILITY_LABELS, localTemperatureError } from '../selectionExplanation';
import styles from './ModelRanking.module.css';

const CRITERION_LABELS: Readonly<Record<CriterionKind, string>> = {
  resolution: 'maille et terrain',
  mediumRange: 'moyenne échéance',
  localSkill: 'erreur mesurée ici',
};

interface ModelRankingProps {
  readonly ranking: readonly Ranking[];
  readonly verification: readonly ModelVerification[];
  readonly activeModel: ModelId | null;
}

/** Échelle des barres : score maximal théorique. */
const MAX_SCORE =
  SELECTION_WEIGHTS.resolution + SELECTION_WEIGHTS.mediumRange + SELECTION_WEIGHTS.localSkill;

export function ModelRankingTable({ ranking, verification, activeModel }: ModelRankingProps) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className="visually-hidden">
          Classement des modèles à l’instant présent, avec la contribution de chaque critère
        </caption>
        <thead>
          <tr>
            <th scope="col">Rang</th>
            <th scope="col">Modèle</th>
            <th scope="col">Score</th>
            <th scope="col" className={styles.hideSmall}>
              Maille
            </th>
            <th scope="col" className={styles.hideSmall}>
              Portée
            </th>
            <th scope="col">Erreur J+1</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((row, index) => {
            const mae = localTemperatureError(verification, row.model);
            const positive = row.criteria.filter((c) => c.points > 0);
            const negative = row.criteria.filter((c) => c.points < 0);
            return (
              <tr
                key={row.model}
                data-active={row.model === activeModel || undefined}
                data-eligible={row.eligible}
                style={{ '--model': modelColorVar(row.model) } as CSSProperties}
              >
                <td data-donnee className={styles.rank}>
                  {row.eligible ? index + 1 : MISSING}
                </td>
                <th scope="row" className={styles.model}>
                  <span className={styles.dot} aria-hidden="true" />
                  {MODEL_LABELS[row.model]}
                  <span className={styles.producer}>{MODEL_SPECS[row.model].producer}</span>
                </th>
                <td className={styles.scoreCell}>
                  {row.eligible ? (
                    <>
                      <span data-donnee className={styles.score}>
                        {formatOneDecimal(row.score)}
                      </span>
                      <span className={styles.bar} aria-hidden="true">
                        {positive.map((c, i) => (
                          <span
                            key={`${c.kind}-${i}`}
                            className={styles.part}
                            data-kind={c.kind}
                            style={{ width: `${(c.points / MAX_SCORE) * 100}%` }}
                            title={CRITERION_LABELS[c.kind]}
                          />
                        ))}
                        {negative.map((c, i) => (
                          <span
                            key={`neg-${c.kind}-${i}`}
                            className={styles.penalty}
                            style={{ width: `${(-c.points / MAX_SCORE) * 100}%` }}
                            title={`${CRITERION_LABELS[c.kind]} (pénalité)`}
                          />
                        ))}
                      </span>
                      <span className="visually-hidden">
                        {row.criteria
                          .map((c) => `${CRITERION_LABELS[c.kind]} ${formatOneDecimal(c.points)}`)
                          .join(', ')}
                      </span>
                    </>
                  ) : (
                    <span className={styles.reason}>
                      {row.ineligibility === null ? '' : INELIGIBILITY_LABELS[row.ineligibility]}
                    </span>
                  )}
                </td>
                <td data-donnee className={styles.hideSmall}>
                  {modelResolution(row.model)}
                </td>
                <td data-donnee className={styles.hideSmall}>
                  {formatInteger(MODEL_SPECS[row.model].maxLeadHours)} h
                </td>
                <td data-donnee>{mae === null ? MISSING : `${formatOneDecimal(mae)} °C`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.legend}>
        <span className={styles.key} data-kind="resolution" /> maille et terrain
        <span className={styles.key} data-kind="mediumRange" /> moyenne échéance
        <span className={styles.key} data-kind="localSkill" /> erreur mesurée ici
        <span className={styles.keyPenalty} /> pénalité
      </p>
    </div>
  );
}
