export type ModelId = 'arome' | 'arpege' | 'icon_eu' | 'gfs';

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
  readonly weatherCode: number | null;
}

export interface DailyPoint {
  readonly date: string; // 'YYYY-MM-DD'
  readonly tempMax: Measure;
  readonly tempMin: Measure;
  readonly precipitationSum: Measure;
  readonly uvIndexMax: Measure;
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
