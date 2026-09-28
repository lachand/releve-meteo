import { ReliabilityPanel } from '../components/ReliabilityPanel';
import { StationCheckPanel } from '../components/StationCheck';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function ReliabilityView({ vm }: { readonly vm: ForecastViewModel }) {
  return (
    <div className={styles.stack}>
      <Section eyebrow="Contrôle au réel" title="Le dernier relevé face aux modèles">
        <StationCheckPanel
          state={vm.station}
          check={vm.stationCheck}
          activeModel={vm.cascade.activeModel}
          windUnit={vm.windUnit}
        />
      </Section>
      <Section
        eyebrow="Fiabilité locale"
        title={`Qui a vu juste à ${vm.place.alias ?? vm.place.name}`}
      >
        <ReliabilityPanel state={vm.verification} />
      </Section>
    </div>
  );
}
