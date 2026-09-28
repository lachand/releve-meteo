import type { Place } from '../domain/types';

/*
 * Placement des etiquettes de la carte des favoris : chaque etiquette
 * part du cercle de station pose sur le lieu, vers la droite, ou vers la
 * gauche quand elle chevaucherait une etiquette deja posee.
 */

/** Decalage du cercle de station dans l'etiquette, px. */
export const ANCHOR_PX = 16;
const PLOT_HEIGHT_PX = 44;
/** Largeur d'une etiquette compacte, px. */
const COMPACT_PLOT_WIDTH_PX = 72;
/** Sous cette largeur de carte, px, les etiquettes sont compactes. */
export const COMPACT_MAP_WIDTH_PX = 560;

/** Largeur estimee d'une etiquette, px : le nom et le modele la dominent. */
export function plotWidth(place: Place, compact = false): number {
  // Compacte : symbole et temperature seuls, le nom est dans la liste.
  if (compact) {
    return COMPACT_PLOT_WIDTH_PX;
  }
  return Math.max(96, 6.6 * ((place.alias ?? place.name).length + 9) + 12);
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Cote de chaque etiquette par rapport a son lieu : a droite par defaut ;
 * a gauche si elle chevaucherait une etiquette deja posee et que la gauche
 * est libre. Les lieux du nord sont poses d'abord. Pur : exporte pour les
 * tests.
 */
export function plotSides(
  plots: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
  }[],
  /** Largeur de la carte, px : une etiquette qui en sortirait a droite passe a gauche. */
  mapWidth: number = Infinity,
): ReadonlyMap<string, 'right' | 'left'> {
  const placed: Box[] = [];
  const sides = new Map<string, 'right' | 'left'>();
  for (const plot of [...plots].sort((a, b) => a.y - b.y)) {
    const top = plot.y - ANCHOR_PX;
    const right: Box = { x: plot.x - ANCHOR_PX, y: top, w: plot.w, h: PLOT_HEIGHT_PX };
    const left: Box = { x: plot.x + ANCHOR_PX - plot.w, y: top, w: plot.w, h: PLOT_HEIGHT_PX };
    const rightBlocked = right.x + right.w > mapWidth || placed.some((box) => overlaps(right, box));
    const leftFree = left.x >= 0 && !placed.some((box) => overlaps(left, box));
    const side = rightBlocked && leftFree ? 'left' : 'right';
    sides.set(plot.id, side);
    placed.push(side === 'right' ? right : left);
  }
  return sides;
}
