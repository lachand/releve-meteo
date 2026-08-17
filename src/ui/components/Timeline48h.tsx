import {
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartOptions, Plugin } from 'chart.js';
import { useEffect, useRef } from 'react';
import { spreadBand } from '../../domain/confidence';
import type { ConfidenceVerdict } from '../../domain/confidence';
import type { ForecastBundle, ModelId } from '../../domain/types';
import type { CascadeView } from '../hooks/useCascadeView';
import { CONFIDENCE_LEVEL_LABELS, MODEL_LABELS, cssVar, modelColor } from '../modelPresentation';
import { weatherCodeLabel } from '../weatherCodePresentation';
import styles from './Timeline48h.module.css';

Chart.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
);

const WINDOW_HOURS = 48;

interface WindowPoint {
  readonly index: number;
  readonly time: string;
  readonly model: ModelId | null;
  readonly value: number | null;
  readonly weatherCode: number | null;
  readonly confidence: ConfidenceVerdict | null;
}

function windowPoints(
  bundle: ForecastBundle,
  cascade: CascadeView,
  confidence: readonly ConfidenceVerdict[] | null,
  start: number,
  end: number,
): WindowPoint[] {
  const points: WindowPoint[] = [];
  for (let i = start; i < end; i += 1) {
    const time = bundle.timeline[i];
    if (time === undefined) {
      continue;
    }
    const segment = cascade.segments.find((s) => i >= s.startIndex && i <= s.endIndex);
    const series = segment ? bundle.series[segment.model] : undefined;
    const hourly = series?.hourly[i];
    const value = hourly?.temperature.value ?? null;
    const weatherCode = hourly?.weatherCode ?? null;
    points.push({
      index: i,
      time,
      model: segment?.model ?? null,
      value,
      weatherCode,
      confidence: confidence?.[i] ?? null,
    });
  }
  return points;
}

function formatHour(iso: string): string {
  const match = /T(\d{2}):/.exec(iso);
  return match?.[1] !== undefined ? `${match[1]}h` : iso;
}

/** windowTransitions : index dans `points` (fenetre), pas dans la timeline complete. */
function transitionPlugin(windowTransitions: readonly number[]): Plugin<'line'> {
  return {
    id: 'modelTransitions',
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const xScale = scales.x;
      if (xScale === undefined) {
        return;
      }
      ctx.save();
      ctx.strokeStyle = cssVar('--encre-faible') || '#5A6B72';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      for (const index of windowTransitions) {
        const x = xScale.getPixelForValue(index);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/**
 * Motif de hachures diagonales a 45 degres, jamais un aplat translucide
 * (DESIGN.md section 5). Construit une fois par rendu de graphique.
 */
function hachurePattern(): CanvasPattern | string {
  if (typeof document === 'undefined') {
    return 'transparent';
  }
  const size = 8;
  const source = document.createElement('canvas');
  source.width = size;
  source.height = size;
  const sctx = source.getContext('2d');
  if (sctx === null) {
    return 'transparent';
  }
  sctx.strokeStyle = cssVar('--encre-faible') || '#5A6B72';
  sctx.lineWidth = 1.25;
  for (const offset of [-size / 2, size / 2, size * 1.5]) {
    sctx.beginPath();
    sctx.moveTo(offset, offset + size);
    sctx.lineTo(offset + size, offset);
    sctx.stroke();
  }
  const target = document.createElement('canvas').getContext('2d');
  return target?.createPattern(source, 'repeat') ?? 'transparent';
}

const SIGNIFICANT_WEATHER_CODE_MIN = 45; // brouillard et au-dela : bruine, pluie, neige, orage

/**
 * Etiquette texte visible directement sur le graphique pour les conditions
 * meteorologiques marquantes (pluie, orage, neige...), pas les simples
 * variations de nuages. N'affiche qu'au debut de chaque episode plutot
 * qu'a chaque heure, pour ne pas noyer le trace.
 */
function conditionLabelsPlugin(points: readonly WindowPoint[]): Plugin<'line'> {
  return {
    id: 'conditionLabels',
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const xScale = scales.x;
      if (xScale === undefined) {
        return;
      }
      ctx.save();
      ctx.fillStyle = cssVar('--encre-faible') || '#5A6B72';
      ctx.font = '10px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      // Un nouveau "episode" au sens strict (code different du precedent)
      // peut survenir toutes les heures si le code oscille (51 -> 53 -> 51).
      // Sans marge minimale entre deux etiquettes, ces episodes courts se
      // chevauchent visuellement : on n'affiche donc une etiquette que si
      // elle laisse assez de place apres la precedente.
      const MIN_LABEL_GAP_PX = 55;
      let previousCode: number | null = null;
      let nextAllowedX = -Infinity;
      for (const [index, point] of points.entries()) {
        const code = point.weatherCode;
        const isSignificant = code !== null && code >= SIGNIFICANT_WEATHER_CODE_MIN;
        const isNewEpisode = isSignificant && code !== previousCode;
        if (isNewEpisode) {
          const label = weatherCodeLabel(code);
          const x = xScale.getPixelForValue(index);
          if (label !== null && x >= nextAllowedX) {
            ctx.fillText(label, Math.min(x + 2, chartArea.right - 2), chartArea.top - 16);
            nextAllowedX = x + ctx.measureText(label).width + MIN_LABEL_GAP_PX;
          }
        }
        previousCode = code;
      }
      ctx.restore();
    },
  };
}

function dashForConfidence(level: ConfidenceVerdict['level'] | undefined): number[] {
  switch (level) {
    case 'high':
      return [];
    case 'medium':
      return [6, 3];
    case 'low':
    case 'unavailable':
    case undefined:
      return [2, 3];
  }
}

interface Timeline48hProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
  readonly confidence: readonly ConfidenceVerdict[] | null;
}

export function Timeline48h({ bundle, cascade, confidence }: Timeline48hProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);

  const start = cascade.nowIndex === -1 ? 0 : cascade.nowIndex;
  const end = Math.min(start + WINDOW_HOURS, bundle.timeline.length);
  const points = windowPoints(bundle, cascade, confidence, start, end);
  const windowTransitions = cascade.transitions
    .filter((index) => index >= start && index < end)
    .map((index) => index - start);
  const band = spreadBand(bundle, 'temperature').slice(start, end);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 18 } },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          grid: { color: cssVar('--grille-faible') },
        },
        y: {
          title: { display: true, text: '°C' },
          grid: { color: cssVar('--grille-faible') },
        },
      },
      plugins: {
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            label: (item) => {
              const point = points[item.dataIndex];
              const modelLabel =
                point?.model !== null && point?.model !== undefined
                  ? MODEL_LABELS[point.model]
                  : '';
              const condition = weatherCodeLabel(point?.weatherCode ?? null);
              const conditionSuffix = condition !== null ? ` · ${condition}` : '';
              const confidenceLevel = point?.confidence?.level;
              const confidenceLabel =
                confidenceLevel !== undefined
                  ? ` · confiance ${CONFIDENCE_LEVEL_LABELS[confidenceLevel].toLowerCase()}`
                  : '';
              return `${item.formattedValue} °C (${modelLabel})${conditionSuffix}${confidenceLabel}`;
            },
          },
        },
      },
    };

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: points.map((p) => formatHour(p.time)),
        datasets: [
          {
            label: 'Temperature',
            data: points.map((p) => p.value),
            spanGaps: false,
            borderWidth: 2,
            pointRadius: 0,
            order: 0,
            segment: {
              borderColor: (ctx) => {
                const model = points[ctx.p0DataIndex]?.model;
                return model === null || model === undefined
                  ? cssVar('--encre-faible') || '#5A6B72'
                  : modelColor(model);
              },
              borderDash: (ctx) => dashForConfidence(points[ctx.p0DataIndex]?.confidence?.level),
            },
          },
          {
            label: 'Ecart maximal entre modeles',
            data: band.map((b) => b.max),
            spanGaps: false,
            borderWidth: 0,
            pointRadius: 0,
            order: 1,
            fill: false,
          },
          {
            label: 'Ecart minimal entre modeles',
            data: band.map((b) => b.min),
            spanGaps: false,
            borderWidth: 0,
            pointRadius: 0,
            order: 1,
            fill: { target: 1 },
            backgroundColor: hachurePattern(),
          },
        ],
      },
      options,
      plugins: [transitionPlugin(windowTransitions), conditionLabelsPlugin(points)],
    });

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- points/band derives de bundle+cascade+confidence a chaque rendu, comparer par reference suffirait a re-declencher trop souvent
  }, [bundle, cascade, confidence]);

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Temperature sur 48 heures, couleur par modele actif, texture par niveau de confiance"
      />
      <ul className={styles.legend}>
        <li>
          <span className={styles.swatchLine} data-dash="solid" /> confiance élevée
        </li>
        <li>
          <span className={styles.swatchLine} data-dash="dashed" /> confiance moyenne
        </li>
        <li>
          <span className={styles.swatchLine} data-dash="dotted" /> confiance faible
        </li>
        <li>
          <span className={styles.swatchHachure} /> écart entre modèles
        </li>
      </ul>
      <table className={styles.dataTable}>
        <caption>
          Temperature horaire sur 48 heures, avec le modele actif, la confiance et l'ecart
          inter-modeles par heure
        </caption>
        <thead>
          <tr>
            <th scope="col">Heure</th>
            <th scope="col">Temperature</th>
            <th scope="col">Modele</th>
            <th scope="col">Confiance</th>
            <th scope="col">Ecart inter-modeles</th>
            <th scope="col">Condition</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, i) => {
            const b = band[i];
            const spreadText =
              b?.min === null || b?.min === undefined || b.max === null
                ? '—'
                : `${b.min} – ${b.max} °C`;
            return (
              <tr key={point.index}>
                <td>{point.time}</td>
                <td>{point.value === null ? '—' : `${point.value} °C`}</td>
                <td>{point.model === null ? '—' : MODEL_LABELS[point.model]}</td>
                <td>
                  {point.confidence !== null
                    ? CONFIDENCE_LEVEL_LABELS[point.confidence.level]
                    : '—'}
                </td>
                <td>{spreadText}</td>
                <td>{weatherCodeLabel(point.weatherCode) ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
