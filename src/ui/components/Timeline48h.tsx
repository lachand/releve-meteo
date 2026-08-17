import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartOptions, Plugin } from 'chart.js';
import { useEffect, useRef } from 'react';
import type { ForecastBundle, ModelId } from '../../domain/types';
import type { CascadeView } from '../hooks/useCascadeView';
import { MODEL_LABELS, modelColor } from '../modelPresentation';
import styles from './Timeline48h.module.css';

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

const WINDOW_HOURS = 48;

interface WindowPoint {
  readonly index: number;
  readonly time: string;
  readonly model: ModelId | null;
  readonly value: number | null;
}

function windowPoints(
  bundle: ForecastBundle,
  cascade: CascadeView,
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
    const value = series?.hourly[i]?.temperature.value ?? null;
    points.push({ index: i, time, model: segment?.model ?? null, value });
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
      ctx.strokeStyle = getComputedStyleVar('--encre-faible');
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

function getComputedStyleVar(name: string): string {
  if (typeof document === 'undefined') {
    return '#5A6B72';
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#5A6B72';
}

interface Timeline48hProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
}

export function Timeline48h({ bundle, cascade }: Timeline48hProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);

  const start = cascade.nowIndex === -1 ? 0 : cascade.nowIndex;
  const end = Math.min(start + WINDOW_HOURS, bundle.timeline.length);
  const points = windowPoints(bundle, cascade, start, end);
  const windowTransitions = cascade.transitions
    .filter((index) => index >= start && index < end)
    .map((index) => index - start);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          grid: { color: getComputedStyleVar('--grille-faible') },
        },
        y: {
          title: { display: true, text: '°C' },
          grid: { color: getComputedStyleVar('--grille-faible') },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => {
              const point = points[item.dataIndex];
              const modelLabel =
                point?.model !== null && point?.model !== undefined
                  ? MODEL_LABELS[point.model]
                  : '';
              return `${item.formattedValue} °C (${modelLabel})`;
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
            data: points.map((p) => p.value),
            spanGaps: false,
            borderWidth: 2,
            pointRadius: 0,
            segment: {
              borderColor: (ctx) => {
                const model = points[ctx.p0DataIndex]?.model;
                return model === null || model === undefined
                  ? getComputedStyleVar('--encre-faible')
                  : modelColor(model);
              },
            },
          },
        ],
      },
      options,
      plugins: [transitionPlugin(windowTransitions)],
    });

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- points est derive de bundle+cascade a chaque rendu, comparer par reference suffirait a re-declencher trop souvent
  }, [bundle, cascade]);

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Temperature sur 48 heures, couleur par modele actif"
      />
      <table className={styles.dataTable}>
        <caption>Temperature horaire sur 48 heures, avec le modele actif par heure</caption>
        <thead>
          <tr>
            <th scope="col">Heure</th>
            <th scope="col">Temperature</th>
            <th scope="col">Modele</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.index}>
              <td>{point.time}</td>
              <td>{point.value === null ? '—' : `${point.value} °C`}</td>
              <td>{point.model === null ? '—' : MODEL_LABELS[point.model]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
