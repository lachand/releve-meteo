import { CascadeFrieze } from '../components/CascadeFrieze';
import { ComparisonView } from '../components/ComparisonView';
import { ModelChooser } from '../components/ModelChooser';
import { ModelRankingTable } from '../components/ModelRanking';
import { ModelStamp } from '../components/ModelStamp';
import { TERRAIN_KIND_LABELS } from '../modelPresentation';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function ModelsView({ vm }: { readonly vm: ForecastViewModel }) {
  const { cascade, explanation } = vm;
  const verification =
    vm.verification.status === 'ready' ? vm.verification.value.verifications : [];
  const automatic = cascade.rankingNow.find((r) => r.eligible)?.model ?? null;

  return (
    <div className={styles.stack}>
      <Section eyebrow="Sélection" title="Quel modèle, et pourquoi">
        <div className={styles.explanation}>
          {cascade.activeModel !== null && (
            <ModelStamp
              model={cascade.activeModel}
              manual={vm.preferred !== null && vm.preferred === cascade.activeModel}
            />
          )}
          <div className={styles.explanationText}>
            <p className="note">{explanation.headline}</p>
            <ul className={styles.reasons}>
              {explanation.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {explanation.runnerUp !== null && (
              <p className={styles.muted}>{explanation.runnerUp}</p>
            )}
            <p className={styles.muted}>
              Terrain retenu pour ce lieu :{' '}
              {vm.terrain === null ? 'inconnu' : TERRAIN_KIND_LABELS[vm.terrain.kind]}
              {vm.verification.status === 'loading' && ' · vérification locale en cours'}
              {vm.verification.status === 'error' &&
                ' · vérification locale indisponible, choix sur la maille et l’échéance seulement'}
              .
            </p>
          </div>
        </div>
        <h3 className={styles.subTitle}>Modèle retenu à chaque échéance</h3>
        <CascadeFrieze bundle={vm.bundle} cascade={cascade} />
        <p className={styles.muted}>
          Un filet tireté marque chaque changement de modèle : les raccords ne sont jamais lissés.
        </p>
      </Section>

      <Section eyebrow="Classement" title="Score de chaque modèle à l’instant présent">
        <ModelRankingTable
          ranking={cascade.rankingNow}
          verification={verification}
          activeModel={cascade.activeModel}
        />
      </Section>

      <Section eyebrow="Votre choix" title="Choisir le modèle de référence">
        <ModelChooser
          preferred={vm.preferred}
          onChange={vm.setPreferred}
          ranking={cascade.rankingNow}
          verification={verification}
          automaticModel={automatic}
        />
      </Section>

      <Section eyebrow="Comparaison" title="Tous les modèles superposés">
        <ComparisonView bundle={vm.bundle} nowIndex={cascade.nowIndex} />
      </Section>
    </div>
  );
}
