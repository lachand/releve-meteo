import { CalibrationPanel } from '../components/CalibrationPanel';
import { JournalPanel } from '../components/JournalPanel';
import { LeadScoresPanel } from '../components/LeadScoresPanel';
import { RainCheckPanel } from '../components/RainCheckPanel';
import { ReliabilityPanel } from '../components/ReliabilityPanel';
import { StationCheckPanel } from '../components/StationCheck';
import { StationTraceChart } from '../components/StationTraceChart';
import { YesterdayPanel } from '../components/YesterdayPanel';
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
      <Section eyebrow="Pluie" title="Pluie réellement tombée, 24 heures">
        <RainCheckPanel state={vm.station} check={vm.rainCheck} />
      </Section>
      <Section eyebrow="Carnet d’hier" title="Hier, prévu contre réel">
        <YesterdayPanel
          state={vm.station}
          review={vm.yesterday}
          activeModel={vm.cascade.activeModel}
        />
      </Section>
      <Section eyebrow="Carnet de bord" title="Journal des prévisions">
        <JournalPanel
          placeId={vm.place.id}
          refreshKey={
            vm.station.status === 'ready' ? String(vm.station.fetchedAt) : vm.station.status
          }
        />
      </Section>
      <Section eyebrow="Confiance vérifiée" title="La confiance annoncée a-t-elle été juste ?">
        <CalibrationPanel
          placeId={vm.place.id}
          refreshKey={
            vm.station.status === 'ready' ? String(vm.station.fetchedAt) : vm.station.status
          }
        />
      </Section>
      <Section eyebrow="Échéances courtes" title="De 1 à 12 heures avant">
        <LeadScoresPanel
          state={vm.station}
          scores={vm.leadScores}
          activeModel={vm.cascade.activeModel}
        />
      </Section>
      <Section
        eyebrow="Fiabilité locale"
        title={`Qui a vu juste à ${vm.place.alias ?? vm.place.name}`}
      >
        <ReliabilityPanel state={vm.verification} activeModel={vm.cascade.activeModel} />
      </Section>
    </div>
  );
}
