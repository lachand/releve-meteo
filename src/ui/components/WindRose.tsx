import { ArcElement, Chart, PolarAreaController, RadialLinearScale, Tooltip } from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { useEffect, useRef } from 'react';
import type { ForecastBundle, ModelId } from '../../domain/types';
import type { CascadeView } from '../hooks/useCascadeView';
import { cssVar, modelColor } from '../modelPresentation';
import { windRoseBuckets } from '../windRose';
import styles from './WindRose.module.css';

Chart.register(ArcElement, PolarAreaController, RadialLinearScale, Tooltip);

const WINDOW_HOURS = 48;

interface WindRoseProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
}

function roseColor(model: ModelId | null): string {
  return model === null ? cssVar('--encre-faible') || '#5A6B72' : modelColor(model);
}

/** Rose des vents statique (DESIGN.md Lot 5 : "sans animation decorative"). */
export function WindRose({ bundle, cascade }: WindRoseProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'polarArea'> | null>(null);

  const start = cascade.nowIndex === -1 ? 0 : cascade.nowIndex;
  const end = Math.min(start + WINDOW_HOURS, bundle.timeline.length);
  const buckets = windRoseBuckets(bundle, cascade, start, end);
  const color = roseColor(cascade.activeModel);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const options: ChartOptions<'polarArea'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        r: {
          ticks: { display: false },
          grid: { color: cssVar('--grille-faible') },
          angleLines: { color: cssVar('--grille-faible') },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => `${item.label} : ${item.formattedValue} h`,
          },
        },
      },
    };

    chartRef.current = new Chart(canvas, {
      type: 'polarArea',
      data: {
        labels: buckets.map((b) => b.direction),
        datasets: [
          {
            data: buckets.map((b) => b.count),
            backgroundColor: buckets.map(() => `${color}55`),
            borderColor: buckets.map(() => color),
            borderWidth: 1,
          },
        ],
      },
      options,
    });

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buckets/color derives de bundle+cascade a chaque rendu
  }, [bundle, cascade]);

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Rose des vents sur ${WINDOW_HOURS} heures, nombre d'heures par direction`}
      />
      <table className={styles.dataTable}>
        <caption>Repartition de la direction du vent sur {WINDOW_HOURS} heures</caption>
        <thead>
          <tr>
            <th scope="col">Direction</th>
            <th scope="col">Heures</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.direction}>
              <td>{bucket.direction}</td>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
