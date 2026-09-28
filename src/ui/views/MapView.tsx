import { RadarMap } from '../components/RadarMap';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function MapView({ vm }: { readonly vm: ForecastViewModel }) {
  return (
    <div className={styles.stack}>
      <Section eyebrow="Radar" title="Pluie observée, deux dernières heures">
        <p className={styles.lede}>
          Réflectivité radar composite (RainViewer) : les deux dernières heures, observées, puis une
          extrapolation d’une demi-heure, marquée « prévu ». Contrairement au reste du relevé,
          l’essentiel de cette carte est une observation.
        </p>
        <RadarMap key={vm.place.id} place={vm.place} />
      </Section>
    </div>
  );
}
