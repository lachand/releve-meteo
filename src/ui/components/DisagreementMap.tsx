import type { ForecastGrid, SpreadGrid } from '../../domain/grid';
import { FORECAST_GRID, SPREAD_GRID_MODELS } from '../../domain/grid';
import type { Place } from '../../domain/types';
import type { DatasetState } from '../hooks/useDataset';
import { ForecastMap } from './ForecastMap';
import styles from './ForecastMap.module.css';

interface DisagreementMapProps {
  readonly place: Place;
  readonly now: Date;
  /** Grilles des modeles, une fois demandees. */
  readonly state: DatasetState<SpreadGrid>;
  readonly requested: boolean;
  readonly onRequest: () => void;
}

/** Appels du quota libre d'Open-Meteo pour charger la carte. */
const CALLS = SPREAD_GRID_MODELS.length * FORECAST_GRID.size * FORECAST_GRID.size;

/**
 * Carte du desaccord entre modeles : la meme grille que la carte de
 * prevision, coloree par l'ecart entre le modele le plus haut et le plus bas.
 * Chargee a la demande : quatre grilles de 81 points pesent sur le quota libre.
 */
export function DisagreementMap({ place, now, state, requested, onRequest }: DisagreementMapProps) {
  if (!requested) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.caption}>
          Où les modèles se contredisent le plus autour de {place.alias ?? place.name} : un grand
          écart dit où la prévision est incertaine. La carte compare {SPREAD_GRID_MODELS.length}{' '}
          modèles sur 81 points, soit environ {CALLS} appels du quota gratuit d’Open-Meteo : elle ne
          se charge qu’à votre demande, puis reste en mémoire une heure.
        </p>
        <button type="button" className={styles.play} onClick={onRequest}>
          Afficher la carte du désaccord
        </button>
      </div>
    );
  }
  const gridState: DatasetState<ForecastGrid> =
    state.status === 'ready' ? { ...state, value: state.value.grid } : state;
  return (
    <ForecastMap
      key={place.id}
      place={place}
      model={SPREAD_GRID_MODELS[0] ?? 'arome_france'}
      state={gridState}
      now={now}
      spread={{ models: state.status === 'ready' ? state.value.models : SPREAD_GRID_MODELS }}
    />
  );
}
