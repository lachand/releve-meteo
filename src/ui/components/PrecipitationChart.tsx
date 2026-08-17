import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { useEffect, useRef } from 'react';
import type { ForecastBundle, Provenance } from '../../domain/types';
import type { CascadeView } from '../hooks/useCascadeView';
import { cssVar } from '../modelPresentation';
import styles from './PrecipitationChart.module.css';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const WINDOW_HOURS = 48;

interface BarPoint {
  readonly time: string;
  readonly value: number | null;
  readonly provenance: Provenance | null;
}

function formatHour(iso: string): string {
  const match = /T(\d{2}):/.exec(iso);
  return match?.[1] !== undefined ? `${match[1]}h` : iso;
}

interface PrecipitationChartProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
}

export function PrecipitationChart({ bundle, cascade }: PrecipitationChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'bar'> | null>(null);

  const start = cascade.nowIndex === -1 ? 0 : cascade.nowIndex;
  const end = Math.min(start + WINDOW_HOURS, bundle.timeline.length);

  const points: BarPoint[] = [];
  for (let i = start; i < end; i += 1) {
    const time = bundle.timeline[i];
    if (time === undefined) {
      continue;
    }
    const segment = cascade.segments.find((s) => i >= s.startIndex && i <= s.endIndex);
    const hourly = segment ? bundle.series[segment.model]?.hourly[i] : undefined;
    points.push({
      time,
      value: hourly?.precipitation.value ?? null,
      provenance: hourly?.precipitation.provenance ?? null,
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const observedColor = cssVar('--observe') || '#16232B';
    const forecastColor = cssVar('--grille') || '#C3CCC8';

    const options: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: 'mm' },
          beginAtZero: true,
          grid: { color: cssVar('--grille-faible') },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => {
              const point = points[item.dataIndex];
              const provenanceLabel = point?.provenance === 'observed' ? 'observé' : 'prévu';
              return `${item.formattedValue} mm (${provenanceLabel})`;
            },
          },
        },
      },
    };

    chartRef.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: points.map((p) => formatHour(p.time)),
        datasets: [
          {
            data: points.map((p) => p.value),
            backgroundColor: points.map((p) =>
              p.provenance === 'observed' ? observedColor : forecastColor,
            ),
            borderWidth: 0,
            categoryPercentage: 0.9,
            barPercentage: 0.9,
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
      <canvas ref={canvasRef} role="img" aria-label="Precipitations horaires sur 48 heures" />
      <ul className={styles.legend}>
        <li>
          <span className={styles.swatch} style={{ background: 'var(--observe)' }} /> observé
        </li>
        <li>
          <span className={styles.swatch} style={{ background: 'var(--grille)' }} /> prévu
        </li>
      </ul>
      <table className={styles.dataTable}>
        <caption>
          Precipitations horaires sur 48 heures, avec la provenance de chaque mesure
        </caption>
        <thead>
          <tr>
            <th scope="col">Heure</th>
            <th scope="col">Precipitation</th>
            <th scope="col">Provenance</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.time}>
              <td>{point.time}</td>
              <td>{point.value === null ? '—' : `${point.value} mm`}</td>
              <td>{point.provenance ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
