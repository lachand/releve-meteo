/**
 * Modeles deterministes interroges chez Open-Meteo. Catalogue complet
 * (portee, maille, forces, faiblesses) dans `models.ts`.
 */
export type ModelId = 'arome' | 'arome_france' | 'icon_d2' | 'arpege' | 'icon_eu' | 'ecmwf' | 'gfs';

export type Provenance = 'observed' | 'estimated' | 'forecast';

export type TerrainKind = 'coastal' | 'mountain' | 'plateau' | 'plain';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unavailable';

export type WeatherVariable = 'temperature' | 'precipitation' | 'wind';

/** Instant ISO 8601 local, timezone Europe/Paris, ex: '2026-08-17T14:00'. */
export type LocalIsoHour = string;

export interface Place {
  readonly id: string; // `${lat.toFixed(4)}:${lon.toFixed(4)}`
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number; // metres
  readonly admin: string | null; // departement
  readonly alias: string | null; // saisi par l'utilisateur
}

export interface TerrainProfile {
  readonly kind: TerrainKind;
  readonly elevation: number;
  readonly distanceToCoastKm: number;
}

/** Une mesure porte toujours sa provenance. Jamais de number nu dans le domaine. */
export interface Measure {
  readonly value: number | null;
  readonly provenance: Provenance;
}

export interface HourlyPoint {
  readonly time: LocalIsoHour;
  readonly temperature: Measure;
  readonly precipitation: Measure;
  readonly windSpeed: Measure;
  readonly windGust: Measure;
  readonly windDirection: Measure;
  readonly pressure: Measure;
  readonly dewPoint: Measure;
  readonly cloudCover: Measure;
  readonly radiation: Measure;
  /** Humidite relative a 2 m, %. */
  readonly humidity: Measure;
  /** Temperature ressentie, °C. */
  readonly apparentTemperature: Measure;
  /** Probabilite de precipitation, %. Absente pour la plupart des modeles deterministes. */
  readonly precipitationProbability: Measure;
  /** Chute de neige, cm par heure. */
  readonly snowfall: Measure;
  /** Energie potentielle convective disponible, J/kg. Moteur des orages. */
  readonly cape: Measure;
  /** Visibilite, m. */
  readonly visibility: Measure;
  /** Altitude de l'isotherme 0 °C, m. */
  readonly freezingLevel: Measure;
  /** Code de temps WMO (table WW simplifiee Open-Meteo). */
  readonly weatherCode: number | null;
  /** Jour (true) ou nuit (false) au sens astronomique, null si inconnu. */
  readonly isDay: boolean | null;
}

export interface DailyPoint {
  readonly date: string; // 'YYYY-MM-DD'
  readonly tempMax: Measure;
  readonly tempMin: Measure;
  readonly precipitationSum: Measure;
  readonly uvIndexMax: Measure;
  /** Rafale maximale du jour, km/h. */
  readonly windGustMax: Measure;
  /** Vent moyen maximal du jour, km/h. */
  readonly windSpeedMax: Measure;
  /** Direction dominante du vent, degres. */
  readonly windDirectionDominant: Measure;
  /** Nombre d'heures avec precipitation. */
  readonly precipitationHours: Measure;
  /** Cumul de neige, cm. */
  readonly snowfallSum: Measure;
  readonly sunrise: string | null;
  readonly sunset: string | null;
  readonly weatherCode: number | null;
}

export interface ModelSeries {
  readonly model: ModelId;
  readonly hourly: readonly HourlyPoint[];
  readonly daily: readonly DailyPoint[];
}

export interface ForecastBundle {
  readonly place: Place;
  readonly fetchedAt: number; // epoch ms
  readonly timeline: readonly LocalIsoHour[]; // axe commun a toutes les series
  readonly series: Partial<Record<ModelId, ModelSeries>>;
}

/** Stockage localStorage, cle unique `meteo-fr:prefs`. ARCHITECTURE.md section 4.6. */
export interface Preferences {
  readonly version: 1;
  readonly favourites: readonly Place[]; // ordre significatif
  readonly units: { readonly temperature: 'C'; readonly wind: 'kmh' | 'kt' };
  readonly theme: 'auto' | 'light' | 'dark';
  readonly solar: { readonly peakKwp: number | null };
  readonly apiKeys: { readonly vigilance: string | null; readonly infoclimat: string | null };
  readonly alerts: readonly AlertRule[];
}

export interface AlertRule {
  readonly id: string;
  /**
   * 'value' (defaut, regles enregistrees avant l'existence du champ) : la
   * valeur du modele retenu franchit le seuil. 'spread' : les modeles
   * s'ecartent de plus que le seuil, dans l'unite de la grandeur ; le sens
   * est alors toujours 'gt'.
   */
  readonly kind?: 'value' | 'spread';
  readonly placeId: string;
  readonly variable: WeatherVariable;
  readonly comparator: 'lt' | 'gt';
  readonly threshold: number;
  readonly enabled: boolean;
}
