import { DailyList } from '../components/DailyList';
import { EnsembleChart } from '../components/EnsembleChart';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function DaysView({ vm }: { readonly vm: ForecastViewModel }) {
  return (
    <div className={styles.stack}>
      <Section eyebrow="Jour par jour" title={`${vm.days.length} jours, modèle retenu chaque jour`}>
        <DailyList
          days={vm.days}
          ensemble={vm.ensembleDays}
          windUnit={vm.windUnit}
          today={vm.today}
        />
      </Section>
      <Section eyebrow="15 jours" title="Ce que dit l’ensemble ECMWF">
        <p className={styles.lede}>
          Au-delà de quelques jours, une prévision unique ne suffit plus. L’ensemble relance le
          modèle ECMWF avec 51 états initiaux légèrement différents : quand les trajectoires restent
          groupées, la tendance est solide ; quand l’éventail s’ouvre, elle devient incertaine.
        </p>
        {vm.ensembleState === 'loading' && (
          <div className={styles.skeleton} aria-busy="true" aria-label="Chargement de l'ensemble" />
        )}
        {vm.ensembleState === 'error' && (
          <p className={styles.muted}>
            Ensemble indisponible pour le moment : les 10 jours déterministes ci-dessus restent
            valables.
          </p>
        )}
        {vm.ensembleDays !== null && (
          <EnsembleChart days={vm.ensembleDays} memberCount={vm.ensembleMembers} />
        )}
      </Section>
    </div>
  );
}
