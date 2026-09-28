# ARCHITECTURE.md

## 1. Principe structurant

Trois couches, dépendances à sens unique :

```
ui/  ────────►  data/  ────────►  domain/
                                     ▲
ui/  ───────────────────────────────┘
```

- `domain/` ne dépend de rien.
- `data/` dépend de `domain/` (pour les types et le mapping) et des API du navigateur.
- `ui/` dépend des deux.

Toute violation de ce sens est refusée par ESLint (`import/no-restricted-paths`).

## 2. Arborescence

```
src/
├── domain/
│   ├── types.ts
│   ├── constants.ts
│   ├── models.ts          # catalogue des 7 modeles (portee, maille, forces, faiblesses)
│   ├── modelSelection.ts  # score explicable, cascade dynamique
│   ├── modelCascade.ts    # segments, completion des champs absents
│   ├── dailyBlend.ts      # un modele par jour, completion
│   ├── terrain.ts
│   ├── confidence.ts
│   ├── reliability.ts     # MAE, biais, RMSE, table pluie/sec
│   ├── stations.ts        # station de reference la plus proche
│   ├── phenomena.ts       # orage, pluie forte, neige, verglas, gel, brouillard, vent, chaleur
│   ├── ensemble.ts        # quantiles d'ensemble, probabilites
│   ├── nowcast.ts         # resume de la pluie au quart d'heure
│   ├── stationCheck.ts    # dernier releve de station face a chaque modele
│   ├── grid.ts            # grille de la carte de prevision
│   ├── derived.ts
│   └── time.ts
├── data/
│   ├── clients/
│   │   ├── openMeteo.ts       # prevision 7 modeles, nowcast
│   │   ├── ensemble.ts        # ECMWF ENS 51 membres
│   │   ├── verification.ts    # previsions passees + reference
│   │   ├── meteostat.ts       # observations de station
│   │   ├── airQuality.ts      # CAMS : indice europeen, particules, pollens
│   │   ├── geocoding.ts
│   │   ├── forecastGrid.ts    # carte de prevision : une requete multi-points
│   │   ├── rainviewer.ts
│   │   └── http.ts
│   ├── mappers/
│   │   ├── openMeteoMapper.ts
│   │   └── nowcastMapper.ts
│   ├── cache/
│   │   ├── db.ts
│   │   ├── forecastStore.ts
│   │   ├── geocodingStore.ts
│   │   ├── datasetStore.ts    # cache generique a expiration (v2)
│   │   ├── modelChoice.ts     # choix manuel du modele, par lieu
│   │   └── preferences.ts
│   ├── queue.ts
│   └── repository.ts
├── ui/
│   ├── components/
│   ├── symbols/           # symboles synoptiques OMM, barbules
│   ├── views/             # App + une vue par onglet
│   ├── hooks/
│   └── styles/
│       ├── tokens.css
│       └── base.css
├── pwa/
│   ├── sw.ts
│   └── install.ts
└── main.tsx

public/
├── manifest.webmanifest
├── icons/
├── offline.html
└── data/coastline-fr.json

tests/
├── fixtures/
├── e2e/
└── setup.ts
```

## 3. Couche domaine

### 3.1 `types.ts`

```ts
export type ModelId =
  | 'arome' | 'arome_france' | 'icon_d2' | 'arpege' | 'icon_eu' | 'ecmwf' | 'gfs';

export type Provenance = 'observed' | 'estimated' | 'forecast';

export type TerrainKind = 'coastal' | 'mountain' | 'plateau' | 'plain';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unavailable';

export type WeatherVariable = 'temperature' | 'precipitation' | 'wind';

/** Instant ISO 8601 local, timezone Europe/Paris, ex: '2026-08-17T14:00'. */
export type LocalIsoHour = string;

export interface Place {
  readonly id: string;            // `${lat.toFixed(4)}:${lon.toFixed(4)}`
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;     // metres
  readonly admin: string | null;  // departement
  readonly alias: string | null;  // saisi par l'utilisateur
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
  readonly humidity: Measure;
  readonly apparentTemperature: Measure;
  readonly precipitationProbability: Measure;
  readonly snowfall: Measure;               // cm/h
  readonly cape: Measure;                   // J/kg
  readonly visibility: Measure;             // m
  readonly freezingLevel: Measure;          // m
  readonly weatherCode: number | null;
  readonly isDay: boolean | null;
}

export interface DailyPoint {
  readonly date: string;          // 'YYYY-MM-DD'
  readonly tempMax: Measure;
  readonly tempMin: Measure;
  readonly precipitationSum: Measure;
  readonly uvIndexMax: Measure;
  readonly windGustMax: Measure;
  readonly windSpeedMax: Measure;
  readonly windDirectionDominant: Measure;
  readonly precipitationHours: Measure;
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
  readonly fetchedAt: number;                 // epoch ms
  readonly timeline: readonly LocalIsoHour[]; // axe commun a toutes les series
  readonly series: Partial<Record<ModelId, ModelSeries>>;
}
```

Invariant à faire respecter par le mapper et vérifier par les tests : **toutes les séries d'un bundle partagent exactement `timeline`**, alignées par index. Si un modèle a une couverture plus courte, ses points manquants sont des `Measure` à `value: null`, pas un tableau plus court. Sans cet invariant, tout le code de comparaison inter-modèles devient une source de bugs d'alignement.

### 3.2 `constants.ts`

```ts
export const TERRAIN_THRESHOLDS = {
  mountainElevationM: 900,
  plateauElevationM: 300,
  coastalDistanceKm: 10,
} as const;

/** Seuils de dispersion inter-modeles. Bornes basses inclusives. */
export const CONFIDENCE_THRESHOLDS = {
  temperature: { high: 1.5, medium: 3.5 },   // ecart max-min, °C
  wind:        { high: 8,   medium: 18 },    // ecart max-min, km/h
  precipitation: { high: 0.3, medium: 0.7 }, // coefficient de variation
} as const;

/** Penalites terrain: degrade d'un cran le niveau de la variable visee. */
export const TERRAIN_PENALTIES: Readonly<Record<TerrainKind, readonly WeatherVariable[]>> = {
  coastal: ['wind'],
  mountain: ['precipitation', 'temperature'],
  plateau: [],
  plain: [],
} as const;

export const RELIABILITY = {
  retentionDays: 90,
  minSamples: 10,
} as const;

export const CACHE_TTL_MS = {
  forecast: 60 * 60 * 1000,
  geocoding: 30 * 24 * 60 * 60 * 1000,
  vigilance: 15 * 60 * 1000,
  radar: 15 * 60 * 1000,
  ensemble: 3 * 60 * 60 * 1000,
  verification: 12 * 60 * 60 * 1000,
  airQuality: 3 * 60 * 60 * 1000,
  nowcast: 10 * 60 * 1000,
} as const;
```

Les portees des modeles ne sont plus des constantes de cascade : elles vivent dans le catalogue `models.ts` (section 3.9), avec le reste de la connaissance par modele.

Aucun de ces nombres ne doit apparaître ailleurs que dans ce fichier.

### 3.3 `modelCascade.ts` et `modelSelection.ts`

La cascade fixe par échéance des lots 1 à 6 (AROME jusqu'à 36 h, ARPEGE jusqu'à 96 h, puis ICON-EU et GFS) est remplacée par une **sélection explicable** (ROADMAP.md phase A). `modelCascade.ts` ne fait plus que manipuler les segments ; le choix est fait par `modelSelection.ts`.

```ts
// modelCascade.ts
export interface CascadeSegment { readonly model: ModelId; readonly startIndex: number; readonly endIndex: number; }
export type FillableField = 'precipitation' | 'windSpeed' | ... | 'weatherCode';   // tout sauf temperature
export type BlendedPoint = HourlyPoint & {
  readonly model: ModelId;
  readonly filledFrom: Readonly<Partial<Record<FillableField, ModelId>>>;
};
export function transitionIndices(segments): readonly number[];
export function modelAt(segments, index): ModelId | null;
export function blendByCascade(bundle, segments): readonly BlendedPoint[];
export function blendedPointAt(bundle, segments, index): BlendedPoint | null;

// modelSelection.ts
export interface SelectionContext {
  readonly latitude: number; readonly longitude: number;
  readonly terrain: TerrainKind;
  readonly available: readonly ModelId[];
  readonly verification: readonly ModelVerification[];
}
export interface Criterion { readonly kind: 'resolution' | 'mediumRange' | 'localSkill'; readonly points: number; readonly detail: {...} }
export interface ModelRanking {
  readonly model: ModelId; readonly score: number; readonly criteria: readonly Criterion[];
  readonly eligible: boolean; readonly ineligibility: 'unavailable' | 'outOfDomain' | 'outOfRange' | null;
}
export function rankModels(context, leadHours): readonly ModelRanking[];
export function selectBestModel(context, leadHours): ModelRanking | null;
export function buildSelectedCascade(input: {
  timeline, now, context, preferred?: ModelId | null, hysteresisPoints?: number,
  hasData?: (model, index) => boolean,
}): readonly CascadeSegment[];
```

Score, en points, somme de critères nommés (`SELECTION_WEIGHTS`) :

- **maille et terrain** : `10 × exp(-échéance / 60 h) × terrainFit(modèle, terrain)`, où `terrainFit = maille_km^-s` avec `s` = 1 en montagne, 0,8 sur la côte, 0,5 sur plateau, 0,3 en plaine ;
- **moyenne échéance** : `10 × (1 - exp(-échéance / 60 h)) × qualité a priori` (ECMWF 1 ; ICON-EU 0,8 ; ARPEGE 0,78 ; régionaux 0,7 ; GFS 0,68) ;
- **erreur mesurée ici** : par variable (température 0,5, pluie 0,3, vent 0,2), `6 × poids × (MAE des pairs - MAE du modèle) / MAE des pairs` borné à ±1, multiplié par `n / (n + 15)` (retrait vers zéro sur petit échantillon), à l'échéance vérifiée la plus proche.

Éligibilité : présent dans la réponse, domaine géographique (ICON-D2 ne couvre pas l'ouest et le sud), échéance dans la portée du catalogue, et **donnée effectivement présente à cet index** (`hasData`). Un choix manuel (`preferred`) est retenu partout où il est éligible ; au-delà, la sélection automatique reprend, transition visible. Hystérésis de 0,5 point pour éviter les allers-retours entre deux scores proches.

Complétion : un champ absent chez le modèle retenu (AROME 1,3 km : nébulosité, pression, code de temps...) est pris au modèle le plus fin qui le fournit à la même heure, et nommé dans `filledFrom`. La température n'est jamais complétée : c'est elle qui définit la couverture d'un modèle. Aucune moyenne, aucun lissage.

### 3.4 `terrain.ts`

```ts
export interface CoastlinePoint { readonly lat: number; readonly lon: number; }

/** Distance orthodromique au point de littoral le plus proche, en km. */
export function distanceToCoastKm(
  latitude: number,
  longitude: number,
  coastline: readonly CoastlinePoint[],
): number;

/** Bounding box metropole + verification fine. Corse incluse. */
export function isWithinMetropolitanFrance(latitude: number, longitude: number): boolean;

/**
 * Priorite des regles, dans cet ordre strict:
 *   1. distanceToCoastKm < 10  -> 'coastal'  (prime sur l'altitude)
 *   2. elevation > 900         -> 'mountain'
 *   3. elevation > 300         -> 'plateau'
 *   4. sinon                   -> 'plain'
 * Comparaisons strictes: 900 m exactement n'est pas 'mountain'.
 */
export function classifyTerrain(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly elevation: number;
  readonly distanceToCoastKm: number;
}): TerrainProfile;
```

Le fichier `public/data/coastline-fr.json` est un tableau de points échantillonnés tous les 2 km environ, généré une fois et versionné. Cible : moins de 60 ko après gzip.

### 3.5 `confidence.ts`

```ts
export interface Dispersion {
  readonly variable: WeatherVariable;
  readonly spread: number;        // °C, km/h, ou coefficient de variation
  readonly modelCount: number;
}

export interface ConfidenceVerdict {
  readonly level: ConfidenceLevel;                          // minimum des niveaux
  readonly byVariable: Readonly<Partial<Record<WeatherVariable, ConfidenceLevel>>>;
  readonly drivers: readonly WeatherVariable[];             // variables qui tirent vers le bas
  readonly modelCount: number;
}

/** null si moins de 2 modeles ont une valeur non nulle a cet index. */
export function dispersionAt(
  bundle: ForecastBundle,
  index: number,
  variable: WeatherVariable,
): Dispersion | null;

/** Applique les seuils puis la penalite terrain. */
export function gradeDispersion(
  dispersion: Dispersion,
  terrain: TerrainProfile,
): ConfidenceLevel;

/**
 * Verdict global. level = minimum des niveaux par variable.
 * Si modelCount < 2 sur toutes les variables -> 'unavailable'.
 */
export function confidenceAt(
  bundle: ForecastBundle,
  index: number,
  terrain: TerrainProfile,
): ConfidenceVerdict;

/** Fourchette min/max inter-modeles, pour la bande d'incertitude. */
export function spreadBand(
  bundle: ForecastBundle,
  variable: WeatherVariable,
): readonly { readonly min: number | null; readonly max: number | null }[];
```

Ordre des niveaux pour le calcul du minimum : `high > medium > low > unavailable`. La pénalité terrain dégrade d'un cran, sans jamais descendre en dessous de `low` (une pénalité ne rend pas une donnée indisponible).

Coefficient de variation des précipitations : si la moyenne est nulle, retourner `spread: 0` et non `NaN`. Tous les modèles annoncent zéro pluie : c'est un accord parfait, donc confiance élevée.

### 3.6 `reliability.ts` et `stations.ts`

```ts
export interface VerificationPair { readonly predicted: number | null; readonly observed: number | null; }
export interface ErrorStats { readonly mae: number; readonly bias: number; readonly rmse: number; readonly count: number; }
export interface RainContingency { hits; misses; falseAlarms; correctNegatives; accuracy: number | null; heidke: number | null }
export interface ModelVerification {
  readonly model: ModelId; readonly variable: WeatherVariable; readonly leadDays: number;
  readonly stats: ErrorStats | null;          // null si 'collecting'
  readonly rain: RainContingency | null;      // precipitations seulement
  readonly sampleCount: number;
  readonly status: 'ready' | 'collecting';
  readonly reference: Provenance;             // 'observed' (station) ou 'estimated' (reanalyse)
}
export function errorStats(pairs): ErrorStats | null;        // paires incompletes ignorees, jamais 0
export function rainContingency(pairs, thresholdMm = 0.2): RainContingency;
export function verifyModel(input): ModelVerification;       // seuil RELIABILITY.minSamples
export function rankByError(verifications): readonly ModelVerification[];
// Conserves de la specification initiale : ArchivedForecast, scoreFromSamples, matchSamples, pruneArchive.

// stations.ts
export interface Station { id; name; latitude; longitude; elevation: number | null }
export function nearestStation(input): StationMatch | null; // < 30 km et < 200 m de denivele
```

L'archive locale prévue au Lot 7 n'est pas construite : la Previous Runs API d'Open-Meteo sert les prévisions émises jusqu'à J-7 sur des mois, ce qui rend la vérification disponible dès la première visite (voir BACKLOG.md, Écarts constatés).

### 3.7 `derived.ts`

```ts
/** Formule de Magnus-Tetens. Tolerance attendue: 0.1 °C. */
export function dewPoint(temperatureC: number, relativeHumidity: number): number;

export function frostRisk(minTemperatureC: number | null): 'none' | 'possible' | 'likely';

export function fogRisk(input: {
  readonly temperatureC: number;
  readonly dewPointC: number;
  readonly windSpeedKmh: number;
}): 'none' | 'possible' | 'likely';

/** Cumul glissant. Les null sont ignores, pas comptes comme zero. */
export function rollingSum(
  values: readonly (number | null)[],
  windowSize: number,
): readonly (number | null)[];

/** Production PV estimee, en kWh. systemLoss par defaut 0.20. */
export function solarYieldKwh(
  radiationWm2: readonly (number | null)[],
  peakKwp: number,
  systemLoss?: number,
): number;
```

Seuils : `frostRisk` retourne `likely` en dessous de 0 °C, `possible` entre 0 et 2 °C. `fogRisk` retourne `likely` si l'écart température moins point de rosée est inférieur à 1 °C et le vent inférieur à 8 km/h.

### 3.8 `time.ts`

```ts
/** Difference en heures entre deux instants ISO locaux, tolerante au changement d'heure. */
export function hoursBetween(from: LocalIsoHour, to: LocalIsoHour): number;

/** Index du premier point de timeline egal ou posterieur a now. -1 si aucun. */
export function indexOfNow(timeline: readonly LocalIsoHour[], now: Date): number;

/** Detecte un saut d'offset UTC dans la serie (passage heure ete/hiver). */
export function hasDstTransition(timeline: readonly LocalIsoHour[]): boolean;
```

Toute arithmétique de dates passe par ce module. Aucun `new Date(str)` ailleurs dans `domain/`.

### 3.9 `models.ts`

Catalogue déclaratif, seule source de connaissance par modèle : libellé, producteur, maille (km), portée (h), cadence, domaine (`france`, `central_europe`, `europe`, `global`), rang de finesse, variables horaires absentes chez Open-Meteo, points forts et points faibles (textes d'interface). `MODEL_ORDER` va du plus fin au plus large. `coversLocation` teste l'emprise d'ICON-D2 avec une marge d'un demi-degré. Portées et variables vérifiées en direct le 2026-09-28.

### 3.10 `phenomena.ts`

`detectPhenomena(points)` regroupe en épisodes les heures à risque (deux heures calmes ou moins entre deux heures à risque : même épisode) pour huit phénomènes, chacun avec ses seuils nommés (`PHENOMENON_THRESHOLDS`) et sa valeur de pointe : orage (code 95-99, CAPE 500 / 1000 / 2000 J/kg avec pluie), forte pluie (4 et 7,6 mm/h), neige (cumul horaire ou code), pluie verglaçante (codes 56/57/66/67, ou pluie sans neige par température négative), gel (2, 0, -5 °C), brouillard (visibilité 1000 / 200 m, code 45/48, ou air saturé et vent faible), vent fort (rafales 60 / 80 / 100 km/h), chaleur (30 / 33 / 36 °C). Chaque épisode porte le modèle de son point de pointe.

### 3.11 `ensemble.ts`, `nowcast.ts`, `dailyBlend.ts`

- `ensemble.ts` : quantiles (méthode 7), agrégation journalière par membre (max, min, cumul) puis quantiles et probabilités de dépassement (1 mm, 10 mm) ; une journée de membre trop lacunaire est écartée, jamais complétée par des zéros.
- `nowcast.ts` : `summarizeNowcast(times, values, now)` : sec, début de pluie dans N min, pluie en cours et fin prévue. Un trou interrompt l'analyse : on ne suppose jamais qu'une valeur absente est sèche.
- `dailyBlend.ts` : un modèle par jour, choisi par le même score (échéance du midi) parmi ceux qui couvrent la journée entière ; champs quotidiens absents complétés et nommés (`filledFrom`).

## 4. Couche données

### 4.1 Correspondance des identifiants de modèle

```ts
export const OPEN_METEO_MODEL_IDS: Readonly<Record<ModelId, string>> = {
  arome: 'meteofrance_arome_france_hd',
  arome_france: 'meteofrance_arome_france',
  icon_d2: 'icon_d2',
  arpege: 'meteofrance_arpege_europe',
  icon_eu: 'icon_eu',
  ecmwf: 'ecmwf_ifs025',
  gfs: 'gfs_seamless',
} as const;
```

L'agent doit vérifier ces identifiants contre la documentation Open-Meteo au démarrage du lot 1 et consigner toute divergence.

### 4.2 Client Open-Meteo

```ts
export interface ForecastQuery {
  readonly latitude: number;
  readonly longitude: number;
  readonly models: readonly ModelId[];
  readonly pastDays?: number;      // 0 a 92
  readonly forecastDays?: number;  // defaut 7
}

export function buildForecastUrl(query: ForecastQuery): string;

export async function fetchForecast(
  query: ForecastQuery,
  signal?: AbortSignal,
): Promise<RawForecastResponse>;
```

URL produite, forme attendue :

```
https://api.open-meteo.com/v1/forecast
  ?latitude=45.4936&longitude=5.4708
  &models=meteofrance_arome_france_hd,meteofrance_arpege_europe,icon_eu,gfs_seamless
  &hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,
          wind_direction_10m,pressure_msl,dew_point_2m,cloud_cover,
          shortwave_radiation,weather_code
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,
         uv_index_max,sunrise,sunset,weather_code
  &timezone=Europe%2FParis
  &past_days=3&forecast_days=7
```

Quand plusieurs modèles sont demandés, Open-Meteo suffixe les clés de variables par le nom du modèle. Payload de référence, tronqué :

```json
{
  "latitude": 45.49,
  "longitude": 5.47,
  "elevation": 468.0,
  "timezone": "Europe/Paris",
  "utc_offset_seconds": 7200,
  "hourly_units": {
    "time": "iso8601",
    "temperature_2m_meteofrance_arome_france_hd": "°C",
    "temperature_2m_meteofrance_arpege_europe": "°C",
    "precipitation_meteofrance_arome_france_hd": "mm"
  },
  "hourly": {
    "time": ["2026-08-17T00:00", "2026-08-17T01:00", "2026-08-17T02:00"],
    "temperature_2m_meteofrance_arome_france_hd": [14.2, 13.8, null],
    "temperature_2m_meteofrance_arpege_europe": [14.6, 14.1, 13.9],
    "precipitation_meteofrance_arome_france_hd": [0.0, 0.2, null],
    "precipitation_meteofrance_arpege_europe": [0.0, 0.1, 0.0]
  }
}
```

Points à traiter obligatoirement dans le mapper :

- La clé de variable est `${variable}_${openMeteoModelId}`. Écrire une fonction dédiée et la tester, ne pas concaténer à la volée dans la boucle de mapping.
- `null` en fin de série pour AROME est le cas normal, pas une erreur. C'est exactement la fin de son échéance.
- `utc_offset_seconds` change au milieu de la série lors du passage heure d'été et heure d'hiver. Les chaînes `time` restent en heure locale et sautent ou répètent une heure. `hasDstTransition` doit le détecter, et l'axe des graphiques doit rester correct.
- Si un modèle demandé est totalement absent du payload, le bundle est construit sans lui. Ce n'est pas une erreur bloquante.

### 4.3 Couche HTTP

```ts
export type HttpFailure =
  | { readonly kind: 'rate_limited'; readonly retryAfterMs: number }
  | { readonly kind: 'server_error'; readonly status: number }
  | { readonly kind: 'network' }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'malformed'; readonly detail: string };

export type HttpResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: HttpFailure };

export interface RequestOptions {
  readonly timeoutMs?: number;   // defaut 10000
  readonly retries?: number;     // defaut 2, backoff exponentiel avec jitter
  readonly signal?: AbortSignal;
}

export async function request<T>(url: string, options?: RequestOptions): Promise<HttpResult<T>>;
```

Aucune exception n'est levée pour un échec réseau. Les erreurs sont des valeurs. Cela force l'UI à traiter chaque cas.

### 4.4 File de requêtes

```ts
/** Deduplique les appels concurrents sur la meme cle et limite la concurrence. */
export function enqueue<T>(key: string, task: () => Promise<T>): Promise<T>;
export function pendingCount(): number;
```

Deux composants demandant le même lieu simultanément déclenchent une seule requête réseau.

### 4.5 Schéma IndexedDB

Base `meteo-fr`, version 2. La version 1 crée `forecasts` et `geocoding` ; la version 2 ajoute `datasets` (cache générique à expiration : ensemble, vérification, qualité de l'air, nowcast ; clé `${kind}.v${schema}|${placeId}`). Les magasins `archive` et `reliability` décrits ci-dessous ne sont pas créés (vérification par la Previous Runs API, voir 3.6). La clé des prévisions est préfixée par la version de forme du bundle (`v2|...`) : un bundle d'une version antérieure n'est jamais relu.

```ts
export interface DbSchema {
  forecasts: {
    key: string;            // `${placeId}|${modelsHash}|${pastDays}|${forecastDays}`
    value: {
      key: string;
      bundle: ForecastBundle;
      storedAt: number;
      expiresAt: number;
    };
    indexes: { byExpiry: number };        // sur expiresAt
  };
  geocoding: {
    key: string;            // requete normalisee, minuscules sans accents
    value: { key: string; places: Place[]; storedAt: number; expiresAt: number };
    indexes: { byExpiry: number };
  };
  archive: {
    key: number;            // autoIncrement
    value: ArchivedForecast;
    indexes: {
      byPlace: string;                    // placeId
      byTarget: string;                   // targetTime
      byPlaceModel: [string, string];     // [placeId, model]
      byIssued: number;                   // issuedAt, pour la purge
    };
  };
  reliability: {
    key: [string, string, string];        // [placeId, model, variable]
    value: ReliabilityScore & { placeId: string; updatedAt: number };
    indexes: Record<string, never>;
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
    indexes: Record<string, never>;
  };
}
```

Migrations : la fonction `upgrade(db, oldVersion, newVersion)` traite chaque version incrémentalement, avec un test dédié par saut de version. Ne jamais supprimer et recréer la base en production pour migrer, cela détruit l'historique de fiabilité de l'utilisateur, qui est irremplaçable.

Repli : si `indexedDB` est indisponible (mode privé strict, Safari verrouillé), basculer sur une implémentation en mémoire respectant la même interface. L'application reste fonctionnelle, sans persistance, avec un message discret dans les réglages.

### 4.6 Préférences (localStorage)

Clé unique `meteo-fr:prefs`, valeur JSON versionnée :

```ts
export interface Preferences {
  readonly version: 1;
  readonly favourites: readonly Place[];   // ordre significatif
  readonly units: { readonly temperature: 'C'; readonly wind: 'kmh' | 'kt' };
  readonly theme: 'auto' | 'light' | 'dark';
  readonly solar: { readonly peakKwp: number | null };
  readonly apiKeys: { readonly vigilance: string | null; readonly infoclimat: string | null };
  readonly alerts: readonly AlertRule[];
}

export interface AlertRule {
  readonly id: string;
  readonly placeId: string;
  readonly variable: WeatherVariable;
  readonly comparator: 'lt' | 'gt';
  readonly threshold: number;
  readonly enabled: boolean;
}
```

Lecture défensive : un JSON corrompu ou d'une version inconnue retourne les préférences par défaut sans faire planter l'application.

### 4.7 Repository

Façade unique consommée par l'UI. C'est le seul point d'entrée que `ui/` connaît.

```ts
export interface ForecastRequest {
  readonly place: Place;
  readonly models: readonly ModelId[];
  readonly forceRefresh?: boolean;
}

export interface ForecastResult {
  readonly bundle: ForecastBundle;
  readonly fromCache: boolean;
  readonly stale: boolean;          // servi hors ligne au dela du TTL
  readonly missingModels: readonly ModelId[];
}

export async function getForecast(
  request: ForecastRequest,
): Promise<HttpResult<ForecastResult>>;

export async function searchPlaces(query: string): Promise<HttpResult<readonly Place[]>>;

// Jeux secondaires : cache a expiration, repli sur la copie perimee hors ligne.
export interface DatasetResult<T> { readonly value: T; readonly fetchedAt: number; readonly stale: boolean; }
export function getEnsemble(place: Place): Promise<HttpResult<DatasetResult<EnsembleHourly>>>;
export function getVerifications(place: Place, models: readonly ModelId[]): Promise<HttpResult<DatasetResult<VerificationReport>>>;
export function getAirQuality(place: Place): Promise<HttpResult<DatasetResult<AirQualitySeries>>>;
export function getNowcast(place: Place): Promise<HttpResult<DatasetResult<Nowcast>>>;
export async function getObservedPrecipitation(place: Place, days: number): Promise<HttpResult<readonly Measure[]>>;
export async function getReliability(place: Place): Promise<readonly ReliabilityScore[]>;
export async function archiveForScoring(bundle: ForecastBundle): Promise<void>;
```

### 4.8 Sources secondaires

| Client | Hôte | Contenu | Provenance |
|---|---|---|---|
| `openMeteo.ts` (`fetchForecast`) | `api.open-meteo.com` | 7 modèles, 18 variables horaires, 12 quotidiennes, `past_days=1`, `forecast_days=10` | `forecast` (passé : `estimated`) |
| `openMeteo.ts` (`fetchNowcast`) | `api.open-meteo.com` | AROME 1,3 km, `minutely_15` précipitation, 3 h | `forecast` |
| `ensemble.ts` | `ensemble-api.open-meteo.com` | ECMWF ENS `ecmwf_ifs025`, 51 membres, 15 jours | `forecast` |
| `verification.ts` | `previous-runs-api.open-meteo.com` | `<variable>_previous_day{1,2,3,5,7}_<modele>`, 36 jours | `forecast` |
| `verification.ts` | `archive-api.open-meteo.com` | ERA5, fenêtre se terminant 6 jours avant aujourd'hui | `estimated` |
| `meteostat.ts` | `data.meteostat.net` | CSV gzip annuel par station, UTC, sources filtrées (`metar`, `dwd_poi`...) | `observed` |
| `airQuality.ts` | `air-quality-api.open-meteo.com` | CAMS : indice européen, PM2,5, PM10, O3, NO2, UV, pollens | `forecast` |

La vérification compare la prévision **au point de la station** de référence quand il y en a une (sinon au point du lieu), variable par variable : station si elle a mesuré au moins la moitié de la fenêtre, sinon réanalyse. La liste des stations (`public/data/stations-fr.json`) est générée par `scripts/generate-stations.py` : seules les stations qui publient réellement des observations récentes sont retenues.

## 5. Contrat d'états de l'interface

Tout écran consommant des données expose quatre états, tous implémentés et tous testés :

| État | Condition | Rendu |
|---|---|---|
| `loading` | requête en cours, aucune donnée en cache | squelette, pas de spinner centré seul |
| `ready` | données disponibles | contenu, avec bandeau si `stale` |
| `empty` | requête réussie, zéro résultat | invitation à agir, pas un message neutre |
| `error` | `HttpResult.ok === false` et pas de cache | cause et action de reprise |

Le cas `stale` n'est pas un état séparé : c'est `ready` avec un bandeau d'horodatage. Voir `DESIGN.md`.
