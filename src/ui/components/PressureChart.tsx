import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { useEffect, useRef } from 'react';
import type { ForecastBundle, ModelId } from '../../domain/types';
import type { CascadeView } from '../hooks/useCascadeView';
import { MODEL_LABELS, cssVar, modelColor } from '../modelPresentation';
import styles from './PressureChart.module.css';

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

const WINDOW_HOURS = 72;

interface LinePoint {
  readonly time: string;
  readonly value: number | null;
  readonly model: ModelId | null;
}

function windowPoints(
  bundle: ForecastBundle,
  cascade: CascadeView,
  start: number,
  end: number,
): LinePoint[] {
  const points: LinePoint[] = [];
  for (let i = start; i < end; i += 1) {
    const time = bundle.timeline[i];
    if (time === undefined) {
      continue;
    }
    const segment = cascade.segments.find((s) => i >= s.startIndex && i <= s.endIndex);
    const hourly = segment ? bundle.series[segment.model]?.hourly[i] : undefined;
    points.push({ time, value: hourly?.pressure.value ?? null, model: segment?.model ?? null });
  }
  return points;
}

function formatHour(iso: string): string {
  const match = /T(\d{2}):/.exec(iso);
  return match?.[1] !== undefined ? `${match[1]}h` : iso;
}

interface PressureChartProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
}

export function PressureChart({ bundle, cascade }: PressureChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);

  const start = cascade.nowIndex === -1 ? 0 : cascade.nowIndex;
  const end = Math.min(start + WINDOW_HOURS, bundle.timeline.length);
  const points = windowPoints(bundle, cascade, start, end);

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
          grid: { color: cssVar('--grille-faible') },
        },
        y: {
          title: { display: true, text: 'hPa' },
          grid: { color: cssVar('--grille-faible') },
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
              return `${item.formattedValue} hPa (${modelLabel})`;
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
            label: 'Pression',
            data: points.map((p) => p.value),
            spanGaps: false,
            borderWidth: 2,
            pointRadius: 0,
            segment: {
              borderColor: (ctx) => {
                const model = points[ctx.p0DataIndex]?.model;
                return model === null || model === undefined
                  ? cssVar('--encre-faible') || '#5A6B72'
                  : modelColor(model);
              },
            },
          },
        ],
      },
      options,
    });

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- points derive de bundle+cascade a chaque rendu
  }, [bundle, cascade]);

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Pression atmospherique sur 72 heures, couleur par modele actif"
      />
      <table className={styles.dataTable}>
        <caption>Pression atmospherique horaire sur 72 heures, avec le modele actif</caption>
        <thead>
          <tr>
            <th scope="col">Heure</th>
            <th scope="col">Pression</th>
            <th scope="col">Modele</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.time}>
              <td>{point.time}</td>
              <td>{point.value === null ? '—' : `${point.value} hPa`}</td>
              <td>{point.model === null ? '—' : MODEL_LABELS[point.model]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
