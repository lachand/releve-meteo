import type { ModelId } from '../domain/types';
import type { CascadeView } from './hooks/useCascadeView';
import { WIND_STRENGTH_KMH } from './symbols/windStrength';

/*
 * Rose des vents : pour chaque secteur de 45 degres (d'ou vient le vent),
 * le nombre d'heures, reparti par force du vent (memes seuils que la
 * fleche de vent). Calcul pur a partir des points de la cascade : chaque
 * heure vient du modele retenu a cette heure, jamais d'un melange.
 */

// Points cardinaux en francais, meme ordre que format.compassPoint.
export const ROSE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export type RoseDirection = (typeof ROSE_DIRECTIONS)[number];

/** Classes de force, de la plus faible a la plus forte. */
export const ROSE_CLASSES = ['light', 'moderate', 'strong', 'veryStrong'] as const;

export type RoseClass = (typeof ROSE_CLASSES)[number];

/** Sous 5 km/h, le vent est calme : il n'a pas de direction qui compte. */
export const ROSE_CALM_KMH = 5;

export interface RoseSector {
  readonly direction: RoseDirection;
  /** Heures par classe de force, dans l'ordre de ROSE_CLASSES. */
  readonly byClass: readonly number[];
  readonly total: number;
}

export interface WindRoseData {
  readonly sectors: readonly RoseSector[];
  /** Heures de vent calme (moins de ROSE_CALM_KMH). */
  readonly calm: number;
  /** Heures comptees : secteurs et calme. */
  readonly hours: number;
  /** Secteur le plus frequent ; null sans aucune heure orientee. */
  readonly dominant: RoseSector | null;
  /** Modeles qui ont fourni ces heures, dans l'ordre d'apparition. */
  readonly models: readonly ModelId[];
}

function sectorIndex(degrees: number): number {
  return Math.round((((degrees % 360) + 360) % 360) / 45) % ROSE_DIRECTIONS.length;
}

function classIndex(speedKmh: number): number {
  const index = WIND_STRENGTH_KMH.findIndex((threshold) => speedKmh < threshold);
  return index === -1 ? ROSE_CLASSES.length - 1 : index;
}

/**
 * Rose sur la fenetre d'index [start, end) de la cascade. Une heure sans
 * vitesse, ou non calme sans direction, est ignoree : jamais rangee dans
 * un secteur par defaut.
 */
export function windRoseData(cascade: CascadeView, start: number, end: number): WindRoseData {
  const counts = ROSE_DIRECTIONS.map(() => ROSE_CLASSES.map(() => 0));
  let calm = 0;
  const models: ModelId[] = [];
  const boundedEnd = Math.min(end, cascade.points.length);
  for (let i = Math.max(0, start); i < boundedEnd; i += 1) {
    const point = cascade.points[i] ?? null;
    const speed = point?.windSpeed.value ?? null;
    if (point === null || speed === null) {
      continue;
    }
    const model = point.filledFrom?.windSpeed ?? point.model;
    if (!models.includes(model)) {
      models.push(model);
    }
    if (speed < ROSE_CALM_KMH) {
      calm += 1;
      continue;
    }
    const degrees = point.windDirection.value;
    if (degrees === null) {
      continue;
    }
    const row = counts[sectorIndex(degrees)];
    const column = classIndex(speed);
    if (row !== undefined) {
      row[column] = (row[column] ?? 0) + 1;
    }
  }
  const sectors = ROSE_DIRECTIONS.map((direction, index): RoseSector => {
    const byClass = counts[index] ?? [];
    return { direction, byClass, total: byClass.reduce((sum, n) => sum + n, 0) };
  });
  const dominant = sectors.reduce<RoseSector | null>(
    (best, sector) => (sector.total > 0 && sector.total > (best?.total ?? 0) ? sector : best),
    null,
  );
  return {
    sectors,
    calm,
    hours: calm + sectors.reduce((sum, sector) => sum + sector.total, 0),
    dominant,
    models,
  };
}

/** Classe de force la plus representee dans un secteur. */
export function mainClass(sector: RoseSector): RoseClass {
  let best = 0;
  sector.byClass.forEach((count, index) => {
    if (count > (sector.byClass[best] ?? 0)) {
      best = index;
    }
  });
  return ROSE_CLASSES[best] ?? 'light';
}

/**
 * Pas des cercles de repere, en heures : 1, 2, 5, 10, 20... de sorte
 * qu'il y ait deux a quatre cercles jusqu'au secteur le plus long.
 */
export function guideStep(maxHours: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100];
  return steps.find((step) => maxHours / step <= 4) ?? 100;
}
