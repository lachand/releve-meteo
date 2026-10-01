import { useState } from 'react';
import { getForecastGrid, getSpreadGrid } from '../../data/repository';
import type { ModelId } from '../../domain/types';
import { DisagreementMap } from '../components/DisagreementMap';
import { FavouritesMap } from '../components/FavouritesMap';
import { FavouritesTable } from '../components/FavouritesTable';
import { LightningMap } from '../components/LightningMap';
import { ForecastMap } from '../components/ForecastMap';
import { PlaceComparison } from '../components/PlaceComparison';
import { RadarMap } from '../components/RadarMap';
import { useDataset } from '../hooks/useDataset';
import { useFavouriteSnapshots } from '../hooks/useFavouriteSnapshots';
import { MODEL_LABELS } from '../modelPresentation';
import { Section } from './Section';
import styles from './Views.module.css';
import type { ForecastViewModel } from './viewModel';

export function MapView({ vm }: { readonly vm: ForecastViewModel }) {
  // La carte de prevision suit le modele retenu pour l'heure presente.
  const model = vm.cascade.activeModel ?? vm.cascade.available[0] ?? null;
  const grid = useDataset(model === null ? null : `grid|${vm.place.id}|${model}`, () =>
    // `model` est non nul des que la cle l'est.
    getForecastGrid(vm.place, model as ModelId),
  );

  // Quatre grilles de 81 points : la carte du desaccord ne se charge qu'a la demande.
  const [spreadRequested, setSpreadRequested] = useState(false);
  const spread = useDataset(spreadRequested ? `spread|${vm.place.id}` : null, () =>
    getSpreadGrid(vm.place),
  );

  const favourites = useFavouriteSnapshots(vm.favourites);

  return (
    <div className={styles.stack}>
      <Section eyebrow="Radar" title="Pluie observée, deux dernières heures">
        <p className={styles.lede}>
          Réflectivité radar composite (RainViewer) : les deux dernières heures, observées, image
          par image toutes les dix minutes ; une éventuelle extrapolation serait marquée « prévu ».
          Contrairement au reste du relevé, cette carte est une observation.
        </p>
        <RadarMap key={vm.place.id} place={vm.place} />
      </Section>
      <Section eyebrow="Foudre" title="Éclairs observés par satellite, deux dernières heures">
        <p className={styles.lede}>
          Ce que le satellite européen MTG a vu : les éclairs, dans les nuages comme vers le sol,
          image par image toutes les cinq minutes. Une observation, comme le radar, mais pas un
          réseau de détection des impacts au sol. Pour savoir où l’orage est <em>prévu</em>, voir la
          couche « Orage » de la carte de prévision plus bas.
        </p>
        <LightningMap key={vm.place.id} place={vm.place} now={vm.now} />
      </Section>
      {model !== null && (
        <Section
          eyebrow="Prévision"
          title={`Pluie, température et orage selon ${MODEL_LABELS[model]}, 48 heures`}
        >
          <p className={styles.lede}>
            La suite du radar : ce que calcule le modèle retenu, heure par heure, sur cent
            kilomètres autour du lieu. Utile pour voir d’où vient une averse, où s’arrête une pluie,
            ce que change le relief. La couche « Orage » montre où le modèle prévoit de
            l’instabilité, pas où la foudre frappe.
          </p>
          <ForecastMap key={vm.place.id} place={vm.place} model={model} state={grid} now={vm.now} />
        </Section>
      )}
      <Section eyebrow="Incertitude" title="Où les modèles se contredisent, 48 heures">
        <DisagreementMap
          place={vm.place}
          now={vm.now}
          state={spread}
          requested={spreadRequested}
          onRequest={() => setSpreadRequested(true)}
        />
      </Section>
      {favourites.length > 0 && (
        <Section eyebrow="Favoris" title="Mes lieux, en ce moment">
          <FavouritesMap snapshots={favourites} activePlaceId={vm.place.id} onOpen={vm.openPlace} />
        </Section>
      )}
      {favourites.length > 1 && (
        <Section eyebrow="Favoris" title="Comparer mes lieux, 24 heures">
          <FavouritesTable
            snapshots={favourites}
            activePlaceId={vm.place.id}
            windUnit={vm.windUnit}
            onOpen={vm.openPlace}
          />
        </Section>
      )}
      {favourites.length > 1 && (
        <Section eyebrow="Favoris" title="Comparer deux lieux, 48 heures">
          <PlaceComparison snapshots={favourites} activePlaceId={vm.place.id} />
        </Section>
      )}
    </div>
  );
}
