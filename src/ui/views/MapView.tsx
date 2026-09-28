import { RadarMap } from '../components/RadarMap';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function MapView({ vm }: { readonly vm: ForecastViewModel }) {
  return (
    <div className={styles.stack}>
      <Section eyebrow="Radar" title="Précipitations observées">
        <p className={styles.lede}>
          Réflectivité radar composite (RainViewer), dernière image disponible. Contrairement au
          reste du relevé, c’est une observation, pas une prévision.
        </p>
        <RadarMap key={vm.place.id} place={vm.place} />
      </Section>
    </div>
  );
}
