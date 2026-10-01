/*
 * Echelles de couleur de la carte de prevision. Une case sans valeur
 * n'a pas de couleur : elle reste transparente, jamais peinte comme zero.
 */

/** Seuils de pluie, mm sur l'heure : sous le premier, la case reste seche. */
export const RAIN_THRESHOLDS = [0.1, 0.5, 2, 5, 10] as const;

/** Lavis d'encre bleue, du crachin a l'averse forte. */
export const RAIN_COLORS = ['#b9d3e6', '#7fb0d6', '#3f84bf', '#1f5c99', '#10376b'] as const;

/** Classe de pluie (0 a 4), ou null : sec (moins de 0,1 mm) ou valeur absente. */
export function rainClass(mm: number | null): number | null {
  if (mm === null || mm < RAIN_THRESHOLDS[0]) {
    return null;
  }
  let result = 0;
  RAIN_THRESHOLDS.forEach((threshold, index) => {
    if (mm >= threshold) {
      result = index;
    }
  });
  return result;
}

/** Couleur de pluie d'une case, ou null si la case reste sans couleur. */
export function rainColor(mm: number | null): string | null {
  const klass = rainClass(mm);
  return klass === null ? null : (RAIN_COLORS[klass] ?? null);
}

/** Du froid au chaud : bleu d'encre, gris vert, sable, ocre, rouge de marge. */
const TEMPERATURE_STOPS = [
  '#2f5f8f',
  '#7fa7c4',
  '#c9cfb8',
  '#e6c98f',
  '#d48a4f',
  '#a8392c',
] as const;

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(channels: readonly number[]): string {
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Couleur d'une temperature sur une echelle relative [min, max], celle
 * de toute la carte sur toute la periode : les contrastes du lieu (vallee,
 * relief, ville) ressortent, et une meme couleur garde son sens d'une heure
 * a l'autre. La legende affiche les bornes en degres.
 */
export function temperatureColor(
  celsius: number,
  range: { readonly min: number; readonly max: number },
): string {
  const span = range.max - range.min;
  const position = span <= 0 ? 0.5 : Math.min(1, Math.max(0, (celsius - range.min) / span));
  const scaled = position * (TEMPERATURE_STOPS.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(TEMPERATURE_STOPS.length - 1, lower + 1);
  const weight = scaled - lower;
  const from = hexToRgb(TEMPERATURE_STOPS[lower] ?? TEMPERATURE_STOPS[0]);
  const to = hexToRgb(TEMPERATURE_STOPS[upper] ?? TEMPERATURE_STOPS[0]);
  return toHex(from.map((channel, index) => channel + ((to[index] ?? channel) - channel) * weight));
}

/** Degrade CSS de la legende de temperature. */
export const TEMPERATURE_GRADIENT = `linear-gradient(to right, ${TEMPERATURE_STOPS.join(', ')})`;

/**
 * Carte du desaccord : seuils de l'ecart entre modeles. Sous le premier, les
 * modeles s'accordent et la case reste sans couleur (jamais peinte comme un
 * ecart nul quand la valeur manque : une case sans ecart calcule est
 * pointillee, comme ailleurs).
 */
export const SPREAD_THRESHOLDS = {
  /** °C. */
  temperature: [0.5, 1, 2, 3, 5],
  /** mm sur l'heure. */
  rain: [0.1, 0.5, 1, 2, 4],
} as const;

/** Lavis d'encre sepia, de l'ecart leger au desaccord franc. */
export const SPREAD_COLORS = ['#eadfc6', '#d9b98a', '#c58a52', '#a8562f', '#7a2a1d'] as const;

/** Couleur d'un ecart, ou null quand les modeles s'accordent (ou que l'ecart manque). */
export function spreadColor(value: number | null, variable: 'temperature' | 'rain'): string | null {
  if (value === null) {
    return null;
  }
  const thresholds = SPREAD_THRESHOLDS[variable];
  let klass: number | null = null;
  thresholds.forEach((threshold, index) => {
    if (value >= threshold) {
      klass = index;
    }
  });
  return klass === null ? null : (SPREAD_COLORS[klass] ?? null);
}
