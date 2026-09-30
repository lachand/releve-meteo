import { ReliabilityPanel } from '../components/ReliabilityPanel';
import { StationCheckPanel } from '../components/StationCheck';
import { StationTraceChart } from '../components/StationTraceChart';
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
      {vm.stationTrace !== null && vm.station.status === 'ready' && (
        <Section eyebrow="Heure par heure" title="Mesure et modèles, ces dernières heures">
          <StationTraceChart
            trace={vm.stationTrace}
            activeModel={vm.cascade.activeModel}
            stationName={vm.station.value.match?.station.name ?? 'la station'}
          />
        </Section>
      )}
      <Section
        eyebrow="Fiabilité locale"
        title={`Qui a vu juste à ${vm.place.alias ?? vm.place.name}`}
      >
        <ReliabilityPanel state={vm.verification} />
      </Section>
    </div>
  );
}
