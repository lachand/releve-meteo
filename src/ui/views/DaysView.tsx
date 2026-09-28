import { windowTotal } from '../../domain/derived';
import { DailyList } from '../components/DailyList';
import { EnsembleChart } from '../components/EnsembleChart';
import { formatCompact } from '../format';
import { MODEL_LABELS } from '../modelPresentation';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

/** Jours du cumul hebdomadaire, aujourd'hui compris. */
const WEEK_DAYS = 7;

/** « 14,3 mm sur 7 jours, selon AROME, ICON-EU et ECMWF IFS ». */
function weekTotal(days: ForecastViewModel['days']): string | null {
  const week = days.slice(0, WEEK_DAYS);
  const { total, missing } = windowTotal(week.map((day) => day.precipitationSum.value));
  if (total === null || week.length === 0) {
    return null;
  }
  const models = [...new Set(week.map((day) => MODEL_LABELS[day.model]))];
  const sources =
    models.length === 1
      ? `selon ${models[0] ?? ''}`
      : `selon ${models.slice(0, -1).join(', ')} et ${models.at(-1) ?? ''}`;
  const amount = `${formatCompact(Math.round(total * 10) / 10)}\u00a0mm sur ${week.length}\u00a0jours`;
  return missing === 0
    ? `${amount}, ${sources}`
    : `au moins ${amount}, ${sources} (${missing}\u00a0jour${missing > 1 ? 's' : ''} sans donnée)`;
}

export function DaysView({ vm }: { readonly vm: ForecastViewModel }) {
  const week = weekTotal(vm.days);
  return (
    <div className={styles.stack}>
      <Section eyebrow="Jour par jour" title={`${vm.days.length} jours, modèle retenu chaque jour`}>
        {week !== null && (
          <p className={styles.lede}>Cumul de pluie prévu, aujourd’hui compris : {week}.</p>
        )}
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
