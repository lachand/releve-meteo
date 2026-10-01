import type { HourlyPoint, LocalIsoHour, ModelId } from './types';

/*
 * Detection des phenomenes remarquables sur une serie horaire (ROADMAP.md
 * B4) : orage, forte pluie, neige, pluie verglacante, gel, brouillard, vent
 * fort, chaleur. Chaque episode garde les valeurs qui l'ont declenche :
 * l'interface les affiche comme justification, jamais un simple pictogramme.
 *
 * Tous les seuils sont ici et nommes. Sources : Meteo-France (vigilance
 * vent, canicule), AMS Glossary (pluie forte >= 7,6 mm/h), litterature
 * usuelle pour la CAPE (500 / 1000 / 2000 J/kg).
 */

export type PhenomenonKind =
  'thunderstorm' | 'heavyRain' | 'snow' | 'freezingRain' | 'frost' | 'fog' | 'strongWind' | 'heat';

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface PhenomenonEvidence {
  /** Valeur de pointe de la grandeur determinante (unite selon le phenomene). */
  readonly peakValue: number | null;
  readonly cape: number | null;
  readonly weatherCode: number | null;
}

export interface PhenomenonEpisode {
  readonly kind: PhenomenonKind;
  readonly level: RiskLevel;
  readonly start: LocalIsoHour;
  readonly end: LocalIsoHour;
  readonly peakTime: LocalIsoHour;
  readonly evidence: PhenomenonEvidence;
  /** Modele qui porte le point de pointe, pour la provenance. */
  readonly model: ModelId | null;
}

export const PHENOMENON_THRESHOLDS = {
  thunderstorm: { capeLow: 500, capeModerate: 1000, capeHigh: 2000, precipMm: 0.5 },
  heavyRain: { moderateMmH: 4, highMmH: 7.6 },
  snow: { moderateCmH: 1, highCmH: 3 },
  frost: { lowC: 2, moderateC: 0, highC: -5 },
  fog: { highVisibilityM: 200, moderateVisibilityM: 1000 },
  strongWind: { lowGustKmh: 60, moderateGustKmh: 80, highGustKmh: 100 },
  heat: { lowC: 30, moderateC: 33, highC: 36 },
  /** Deux heures calmes ou moins entre deux heures a risque : meme episode. */
  mergeGapHours: 2,
} as const;

const LEVEL_RANK: Readonly<Record<RiskLevel, number>> = { low: 1, moderate: 2, high: 3 };

const THUNDER_CODES = new Set([95, 96, 99]);
const FREEZING_CODES = new Set([56, 57, 66, 67]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const FOG_CODES = new Set([45, 48]);

export interface HourlyRisk {
  readonly level: RiskLevel;
  readonly value: number | null;
}

type Point = HourlyPoint & { readonly model?: ModelId };

/**
 * Niveau d'orage d'une heure prevue : le code meteo orage du modele, ou une
 * CAPE elevee avec de la pluie. Partage par la detection d'episodes et la
 * carte du potentiel d'orage. null : pas d'orage prevu (ou donnees absentes).
 */
export function thunderRiskOf(input: {
  readonly cape: number | null;
  readonly precipitation: number | null;
  readonly weatherCode: number | null;
}): HourlyRisk | null {
  const t = PHENOMENON_THRESHOLDS.thunderstorm;
  const { cape, precipitation: precip, weatherCode: code } = input;
  if (code !== null && THUNDER_CODES.has(code)) {
    return {
      level: code === 95 && (cape === null || cape < t.capeHigh) ? 'moderate' : 'high',
      value: cape,
    };
  }
  if (cape === null || precip === null || precip < t.precipMm) {
    return null;
  }
  if (cape >= t.capeHigh) {
    return { level: 'high', value: cape };
  }
  if (cape >= t.capeModerate) {
    return { level: 'moderate', value: cape };
  }
  if (cape >= t.capeLow) {
    return { level: 'low', value: cape };
  }
  return null;
}

function thunderstormAt(p: Point): HourlyRisk | null {
  return thunderRiskOf({
    cape: p.cape.value,
    precipitation: p.precipitation.value,
    weatherCode: p.weatherCode,
  });
}

function heavyRainAt(p: Point): HourlyRisk | null {
  const t = PHENOMENON_THRESHOLDS.heavyRain;
  const precip = p.precipitation.value;
  if (precip === null) {
    return null;
  }
  if (precip >= t.highMmH) {
    return { level: 'high', value: precip };
  }
  if (precip >= t.moderateMmH) {
    return { level: 'moderate', value: precip };
  }
  return null;
}

function snowAt(p: Point): HourlyRisk | null {
  const t = PHENOMENON_THRESHOLDS.snow;
  const snow = p.snowfall.value;
  if (snow !== null && snow >= t.highCmH) {
    return { level: 'high', value: snow };
  }
  if (snow !== null && snow >= t.moderateCmH) {
    return { level: 'moderate', value: snow };
  }
  if ((snow !== null && snow > 0) || (p.weatherCode !== null && SNOW_CODES.has(p.weatherCode))) {
    return { level: 'low', value: snow };
  }
  return null;
}

function freezingRainAt(p: Point): HourlyRisk | null {
  if (p.weatherCode !== null && FREEZING_CODES.has(p.weatherCode)) {
    return { level: 'high', value: p.temperature.value };
  }
  const temp = p.temperature.value;
  const precip = p.precipitation.value;
  const snow = p.snowfall.value;
  // Pluie (et non neige) par temperature negative : verglas probable au sol.
  if (
    temp !== null &&
    precip !== null &&
    temp <= 0 &&
    precip >= 0.2 &&
    snow !== null &&
    snow === 0
  ) {
    return { level: 'moderate', value: temp };
  }
  return null;
}

function frostAt(p: Point): HourlyRisk | null {
  const t = PHENOMENON_THRESHOLDS.frost;
  const temp = p.temperature.value;
  if (temp === null) {
    return null;
  }
  if (temp <= t.highC) {
    return { level: 'high', value: temp };
  }
  if (temp <= t.moderateC) {
    return { level: 'moderate', value: temp };
  }
  if (temp < t.lowC) {
    return { level: 'low', value: temp };
  }
  return null;
}

function fogAt(p: Point): HourlyRisk | null {
  const t = PHENOMENON_THRESHOLDS.fog;
  const visibility = p.visibility.value;
  if (visibility !== null && visibility < t.highVisibilityM) {
    return { level: 'high', value: visibility };
  }
  if (visibility !== null && visibility < t.moderateVisibilityM) {
    return { level: 'moderate', value: visibility };
  }
  if (p.weatherCode !== null && FOG_CODES.has(p.weatherCode)) {
    return { level: 'moderate', value: visibility };
  }
  // Sans visibilite ni code (AROME 1,3 km) : ecart temperature / rosee.
  const temp = p.temperature.value;
  const dew = p.dewPoint.value;
  const wind = p.windSpeed.value;
  if (visibility === null && temp !== null && dew !== null && wind !== null) {
    if (temp - dew < 1 && wind < 8) {
      return { level: 'low', value: null };
    }
  }
  return null;
}

function strongWindAt(p: Point): HourlyRisk | null {
  const t = PHENOMENON_THRESHOLDS.strongWind;
  const gust = p.windGust.value;
  if (gust === null) {
    return null;
  }
  if (gust >= t.highGustKmh) {
    return { level: 'high', value: gust };
  }
  if (gust >= t.moderateGustKmh) {
    return { level: 'moderate', value: gust };
  }
  if (gust >= t.lowGustKmh) {
    return { level: 'low', value: gust };
  }
  return null;
}

function heatAt(p: Point): HourlyRisk | null {
  const t = PHENOMENON_THRESHOLDS.heat;
  const temp = p.temperature.value;
  if (temp === null) {
    return null;
  }
  if (temp >= t.highC) {
    return { level: 'high', value: temp };
  }
  if (temp >= t.moderateC) {
    return { level: 'moderate', value: temp };
  }
  if (temp >= t.lowC) {
    return { level: 'low', value: temp };
  }
  return null;
}

const DETECTORS: Readonly<Record<PhenomenonKind, (p: Point) => HourlyRisk | null>> = {
  thunderstorm: thunderstormAt,
  heavyRain: heavyRainAt,
  snow: snowAt,
  freezingRain: freezingRainAt,
  frost: frostAt,
  fog: fogAt,
  strongWind: strongWindAt,
  heat: heatAt,
};

/** Pour le gel, la pointe est le minimum ; pour la visibilite aussi. */
const PEAK_IS_MINIMUM: ReadonlySet<PhenomenonKind> = new Set(['frost', 'fog', 'freezingRain']);

/** Ordre de gravite pour le tri de l'affichage, a niveau egal. */
export const PHENOMENON_ORDER: readonly PhenomenonKind[] = [
  'thunderstorm',
  'freezingRain',
  'strongWind',
  'heavyRain',
  'snow',
  'heat',
  'fog',
  'frost',
];

function isMoreExtreme(kind: PhenomenonKind, candidate: number | null, current: number | null) {
  if (candidate === null) {
    return false;
  }
  if (current === null) {
    return true;
  }
  return PEAK_IS_MINIMUM.has(kind) ? candidate < current : candidate > current;
}

interface OpenEpisode {
  start: Point;
  end: Point;
  endIndex: number;
  level: RiskLevel;
  peak: Point;
  peakValue: number | null;
}

function closeEpisode(kind: PhenomenonKind, open: OpenEpisode): PhenomenonEpisode {
  return {
    kind,
    level: open.level,
    start: open.start.time,
    end: open.end.time,
    peakTime: open.peak.time,
    evidence: {
      peakValue: open.peakValue,
      cape: open.peak.cape.value,
      weatherCode: open.peak.weatherCode,
    },
    model: open.peak.model ?? null,
  };
}

/**
 * Regroupe les heures a risque en episodes. Deux heures a risque separees
 * par au plus `mergeGapHours` heures calmes forment un seul episode. Le
 * niveau d'un episode est le maximum de ses heures.
 */
export function detectPhenomena(points: readonly Point[]): readonly PhenomenonEpisode[] {
  const episodes: PhenomenonEpisode[] = [];
  for (const kind of PHENOMENON_ORDER) {
    const detect = DETECTORS[kind];
    let current: OpenEpisode | null = null;
    for (const [index, point] of points.entries()) {
      const risk = detect(point);
      if (risk === null) {
        if (current !== null && index - current.endIndex > PHENOMENON_THRESHOLDS.mergeGapHours) {
          episodes.push(closeEpisode(kind, current));
          current = null;
        }
        continue;
      }
      if (current === null) {
        current = {
          start: point,
          end: point,
          endIndex: index,
          level: risk.level,
          peak: point,
          peakValue: risk.value,
        };
        continue;
      }
      current.end = point;
      current.endIndex = index;
      if (LEVEL_RANK[risk.level] > LEVEL_RANK[current.level]) {
        current.level = risk.level;
        current.peak = point;
        current.peakValue = risk.value;
      } else if (
        LEVEL_RANK[risk.level] === LEVEL_RANK[current.level] &&
        isMoreExtreme(kind, risk.value, current.peakValue)
      ) {
        current.peak = point;
        current.peakValue = risk.value;
      }
    }
    if (current !== null) {
      episodes.push(closeEpisode(kind, current));
    }
  }
  return episodes.sort((a, b) => {
    const byLevel = LEVEL_RANK[b.level] - LEVEL_RANK[a.level];
    return byLevel !== 0 ? byLevel : a.start.localeCompare(b.start);
  });
}

/** Niveau le plus eleve, par phenomene, sur une liste d'episodes. */
export function worstLevelByKind(
  episodes: readonly PhenomenonEpisode[],
): Readonly<Partial<Record<PhenomenonKind, RiskLevel>>> {
  const result: Partial<Record<PhenomenonKind, RiskLevel>> = {};
  for (const episode of episodes) {
    const existing = result[episode.kind];
    if (existing === undefined || LEVEL_RANK[episode.level] > LEVEL_RANK[existing]) {
      result[episode.kind] = episode.level;
    }
  }
  return result;
}
