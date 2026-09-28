import { ReliabilityPanel } from '../components/ReliabilityPanel';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function ReliabilityView({ vm }: { readonly vm: ForecastViewModel }) {
  return (
    <div className={styles.stack}>
      <Section
        eyebrow="Fiabilité locale"
        title={`Qui a vu juste à ${vm.place.alias ?? vm.place.name}`}
      >
        <ReliabilityPanel state={vm.verification} />
      </Section>
    </div>
  );
}
