import { AirQualityPanel } from '../components/AirQualityPanel';
import { ConditionsPanel } from '../components/ConditionsPanel';
import { DailyList } from '../components/DailyList';
import { HourlyStrip } from '../components/HourlyStrip';
import { NowcastPanel } from '../components/NowcastPanel';
import { NowPanel } from '../components/NowPanel';
import { PhenomenaPanel } from '../components/PhenomenaPanel';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export const PHENOMENA_HORIZON_HOURS = 72;

export function TodayView({ vm }: { readonly vm: ForecastViewModel }) {
  const { cascade } = vm;
  const nowPoint = cascade.nowIndex === -1 ? null : (cascade.points[cascade.nowIndex] ?? null);
  const confidenceNow =
    cascade.nowIndex === -1 ? null : (vm.confidence?.[cascade.nowIndex] ?? null);

  return (
    <div className={styles.stack}>
      <Section eyebrow="Maintenant" className={styles.nowSheet}>
        <NowPanel
          point={nowPoint}
          confidence={confidenceNow}
          windUnit={vm.windUnit}
          explanation={vm.explanation}
          manual={vm.preferred !== null && vm.preferred === nowPoint?.model}
          onExplain={() => vm.navigate('modeles')}
        />
      </Section>

      <div className={styles.twoColumns}>
        <Section eyebrow="Deux prochaines heures" title="Pluie au quart d’heure">
          <NowcastPanel state={vm.nowcast} now={vm.now} />
        </Section>
        <Section eyebrow={`${PHENOMENA_HORIZON_HOURS} heures`} title="Phénomènes à surveiller">
          <PhenomenaPanel episodes={vm.episodes} horizonHours={PHENOMENA_HORIZON_HOURS} />
        </Section>
      </div>

      <Section
        eyebrow="Heure par heure"
        title="Les 24 prochaines heures"
        aside={
          <button type="button" className={styles.link} onClick={() => vm.navigate('heures')}>
            Détail sur 72 h
          </button>
        }
      >
        <HourlyStrip
          bundle={vm.bundle}
          cascade={cascade}
          hours={24}
          windUnit={vm.windUnit}
          caption="Prévision heure par heure sur 24 heures"
        />
      </Section>

      <Section
        eyebrow="Jours suivants"
        title="Tendance"
        aside={
          <button type="button" className={styles.link} onClick={() => vm.navigate('jours')}>
            Voir 15 jours
          </button>
        }
      >
        <DailyList
          days={vm.days.slice(0, 5)}
          ensemble={vm.ensembleDays}
          windUnit={vm.windUnit}
          today={vm.today}
        />
      </Section>

      <div className={styles.twoColumns}>
        <Section eyebrow="Repères du jour" title="Soleil, rosée, gel">
          <ConditionsPanel nowPoint={nowPoint} today={vm.days[0] ?? null} />
        </Section>
        <Section eyebrow="Air" title="Qualité de l’air et pollens">
          <AirQualityPanel state={vm.airQuality} hour={vm.currentHour} />
        </Section>
      </div>
    </div>
  );
}
