import type { AirQualitySeries } from '../../data/clients/airQuality';
import type { VerificationReport } from '../../data/clients/verification';
import type { Nowcast } from '../../data/mappers/nowcastMapper';
import type { StationReport, VigilanceReport } from '../../data/repository';
import type { AlertHit } from '../../domain/alerts';
import type { SpreadHit } from '../../domain/spreadAlerts';
import type { ConfidenceVerdict } from '../../domain/confidence';
import type { BlendedDay } from '../../domain/dailyBlend';
import type { EnsembleDay } from '../../domain/ensemble';
import type { PhenomenonEpisode } from '../../domain/phenomena';
import type { RainCheck } from '../../domain/rainCheck';
import type { StationCheck } from '../../domain/stationCheck';
import type { StationTrace } from '../../domain/stationTrace';
import type { LeadScores } from '../../domain/leadScores';
import type { YesterdayReview } from '../../domain/yesterdayReview';
import type { VigilanceSummary } from '../../domain/vigilance';
import type {
  AlertRule,
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
  /** Mesure et modeles heure par heure sur les dernieres heures. */
  readonly stationTrace: StationTrace | null;
  /** Pluie mesuree a la station sur 24 h face au calcul du modele retenu ; null sans assez d'heures. */
  readonly rainCheck: RainCheck | null;
  /** Hier, prevu la veille contre mesure a la station ; null sans assez de donnees. */
  readonly yesterday: YesterdayReview | null;
  /** Notes des echeances de 1 a 12 h sur les instantanes enregistres ; null hors station. */
  readonly leadScores: LeadScores | null;
  /** Vigilance Meteo-France du departement, et sa synthese a l'instant. */
  readonly vigilance: DatasetState<VigilanceReport>;
  readonly vigilanceSummary: VigilanceSummary | null;
  readonly episodes: readonly PhenomenonEpisode[];
  readonly explanation: SelectionExplanation;
  readonly windUnit: Preferences['units']['wind'];
  /** Puissance crete solaire saisie, kWc ; null : pas d'estimation solaire. */
  readonly peakKwp: number | null;
  readonly now: Date;
  /** Date locale 'YYYY-MM-DD'. */
  readonly today: string;
  /** Heure locale pleine 'YYYY-MM-DDTHH:00'. */
  readonly currentHour: string;
  readonly preferred: ModelId | null;
  readonly setPreferred: (model: ModelId | null) => void;
  readonly navigate: (view: ViewKey) => void;
  /** Lieux favoris, dans l'ordre choisi. */
  readonly favourites: readonly Place[];
  /** Ouvre le releve d'un autre lieu, dans la vue courante. */
  readonly openPlace: (place: Place) => void;
  /** Alertes personnelles de ce lieu, et celles que la prevision franchit. */
  /** Lecture rapide : l'accueil ne garde que l'essentiel. */
  readonly quick: boolean;
  readonly alertRules: readonly AlertRule[];
  readonly alertHits: readonly AlertHit[];
  readonly spreadHits: readonly SpreadHit[];
  readonly addAlert: (rule: Omit<AlertRule, 'id'>) => void;
  readonly toggleAlert: (id: string) => void;
  readonly removeAlert: (id: string) => void;
}
