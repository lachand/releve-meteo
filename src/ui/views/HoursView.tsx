import { HourlyStrip } from '../components/HourlyStrip';
import { PrecipitationChart } from '../components/PrecipitationChart';
import { PressureChart } from '../components/PressureChart';
import { RainOutlookChart } from '../components/RainOutlookChart';
import { SymbolLegend } from '../components/SymbolLegend';
import { Timeline48h } from '../components/Timeline48h';
import { WindRose } from '../components/WindRose';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function HoursView({ vm }: { readonly vm: ForecastViewModel }) {
  return (
    <div className={styles.stack}>
      <Section eyebrow="48 heures" title="Température et écart entre modèles">
        <Timeline48h bundle={vm.bundle} cascade={vm.cascade} confidence={vm.confidence} />
      </Section>
      <Section eyebrow="48 heures" title="Précipitations">
        <PrecipitationChart bundle={vm.bundle} cascade={vm.cascade} />
      </Section>
      <Section eyebrow="72 heures" title="Probabilité de pluie, heure par heure">
        <RainOutlookChart hours={vm.rainOutlook} memberCount={vm.ensembleMembers} />
      </Section>
      <Section eyebrow="72 heures" title="Relevé horaire">
        <HourlyStrip
          bundle={vm.bundle}
          cascade={vm.cascade}
          hours={72}
          windUnit={vm.windUnit}
          caption="Prévision heure par heure sur 72 heures"
        />
      </Section>
      <Section eyebrow="Au-delà" title="De 3 à 10 jours, pas de 3 heures">
        <HourlyStrip
          bundle={vm.bundle}
          cascade={vm.cascade}
          hours={240}
          step={3}
          windUnit={vm.windUnit}
          caption="Prévision toutes les trois heures jusqu'à dix jours"
        />
      </Section>
      <div className={styles.twoColumns}>
        <Section eyebrow="72 heures" title="Pression">
          <PressureChart bundle={vm.bundle} cascade={vm.cascade} />
        </Section>
        <Section eyebrow="48 heures" title="Rose des vents">
          <WindRose bundle={vm.bundle} cascade={vm.cascade} windUnit={vm.windUnit} />
        </Section>
      </div>
      <Section eyebrow="Légende" title="Symboles du relevé">
        <SymbolLegend />
      </Section>
    </div>
  );
}
