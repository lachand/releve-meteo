import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ScaleOptions } from 'chart.js';
import { cssVar } from './modelPresentation';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
);

// Graduations et infobulles a la francaise : « 1 026 », « 0,1 ».
Chart.defaults.locale = 'fr-FR';

/*
 * Habillage commun des graphiques (DESIGN.md, carnet) : grille sépia,
 * graduations en IBM Plex Mono, titres d'axe en petites capitales, encre
 * du thème courant relue à chaque création de graphique.
 */

export function ink(): string {
  return cssVar('--encre') || '#1c2733';
}

export function faintInk(): string {
  return cssVar('--encre-faible') || '#5b6570';
}

export function gridColor(): string {
  return cssVar('--grille-faible') || '#e4dccb';
}

const TICK_FONT = { family: "'IBM Plex Mono', ui-monospace, monospace", size: 11 };
const TITLE_FONT = {
  family: "'IBM Plex Sans Condensed', system-ui, sans-serif",
  size: 11,
  weight: 600 as const,
};

export function axisX(maxTicks = 8): ScaleOptions<'category'> {
  return {
    ticks: {
      maxRotation: 0,
      autoSkip: true,
      maxTicksLimit: maxTicks,
      color: faintInk(),
      font: TICK_FONT,
    },
    grid: { color: gridColor(), drawTicks: false },
    border: { color: faintInk() },
  };
}

export function axisY(title: string): ScaleOptions<'linear'> {
  return {
    title: { display: true, text: title.toUpperCase(), color: faintInk(), font: TITLE_FONT },
    ticks: { color: faintInk(), font: TICK_FONT },
    grid: { color: gridColor() },
    border: { display: false },
  };
}

export const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(28, 39, 51, 0.94)',
  titleFont: { family: "'IBM Plex Sans', system-ui, sans-serif", size: 12, weight: 600 as const },
  bodyFont: { family: "'IBM Plex Mono', ui-monospace, monospace", size: 12 },
  padding: 10,
  cornerRadius: 2,
  displayColors: false,
};

/**
 * Motif de hachures diagonales a 45 degres, jamais un aplat translucide
 * (DESIGN.md section 5). `density` : ecart entre traits, px.
 */
export function hachurePattern(
  color = faintInk(),
  density = 8,
  width = 1.25,
): CanvasPattern | string {
  if (typeof document === 'undefined') {
    return 'transparent';
  }
  const size = density;
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const sctx = source.getContext('2d');
  if (sctx === null) {
    return 'transparent';
  }
  sctx.strokeStyle = color;
  sctx.lineWidth = width;
  for (const offset of [-size / 2, size / 2, size * 1.5]) {
    sctx.beginPath();
    sctx.moveTo(offset, offset + size);
    sctx.lineTo(offset + size, offset);
    sctx.stroke();
  }
  const target = document.createElement('canvas').getContext('2d');
  return target?.createPattern(source, 'repeat') ?? 'transparent';
}

export { Chart };
