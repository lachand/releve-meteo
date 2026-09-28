import type { AirQualitySeries } from '../../data/clients/airQuality';
import type { VerificationReport } from '../../data/clients/verification';
import type { Nowcast } from '../../data/mappers/nowcastMapper';
import type { StationReport } from '../../data/repository';
import type { ConfidenceVerdict } from '../../domain/confidence';
import type { BlendedDay } from '../../domain/dailyBlend';
import type { EnsembleDay } from '../../domain/ensemble';
import type { PhenomenonEpisode } from '../../domain/phenomena';
import type { StationCheck } from '../../domain/stationCheck';
import type {
  ForecastBundle,
  ModelId,
  Place,
  Preferences,
  TerrainProfile,
} from '../../domain/types';
import type { CascadeView } from '../hooks/useCascadeView';
import type { DatasetState } from '../hooks/useDataset';
import type { SelectionExplanation } from '../selectionExplanation';

export type ViewKey = 'jour' | 'heures' | 'jours' | 'carte' | 'modeles' | 'fiabilite';

export const VIEW_KEYS: readonly ViewKey[] = [
  'jour',
  'heures',
  'jours',
  'carte',
  'modeles',
  'fiabilite',
];

/** Tout ce dont les vues ont besoin, calculé une fois par l'application. */
export interface ForecastViewModel {
  readonly place: Place;
  readonly terrain: TerrainProfile | null;
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
  readonly confidence: readonly ConfidenceVerdict[] | null;
  readonly days: readonly BlendedDay[];
  readonly ensembleDays: readonly EnsembleDay[] | null;
  readonly ensembleMembers: number;
  readonly ensembleState: DatasetState<unknown>['status'];
  readonly verification: DatasetState<VerificationReport>;
  readonly airQuality: DatasetState<AirQualitySeries>;
  readonly nowcast: DatasetState<Nowcast>;
  /** Releves recents de la station representative du lieu. */
  readonly station: DatasetState<StationReport>;
  /** Dernier releve face aux modeles, null tant qu'il n'existe pas. */
  readonly stationCheck: StationCheck | null;
  readonly episodes: readonly PhenomenonEpisode[];
  readonly explanation: SelectionExplanation;
  readonly windUnit: Preferences['units']['wind'];
  readonly now: Date;
  /** Date locale 'YYYY-MM-DD'. */
  readonly today: string;
  /** Heure locale pleine 'YYYY-MM-DDTHH:00'. */
  readonly currentHour: string;
  readonly preferred: ModelId | null;
  readonly setPreferred: (model: ModelId | null) => void;
  readonly navigate: (view: ViewKey) => void;
}
