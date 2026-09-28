import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { useEffect, useRef } from 'react';
import { windowTotal } from '../../domain/derived';
import type { ForecastBundle, ModelId, Provenance } from '../../domain/types';
import { TOOLTIP_STYLE, axisX, axisY, hachurePattern, ink } from '../chartTheme';
import { MISSING, formatCompact } from '../format';
import type { CascadeView } from '../hooks/useCascadeView';
import { MODEL_LABELS, cssVar } from '../modelPresentation';
import styles from './PrecipitationChart.module.css';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const WINDOW_HOURS = 48;
/** Echelle minimale, mm : 0,1 mm ne doit pas remplir le graphique. */
const MIN_SCALE_MM = 1;

const PROVENANCE_LABELS: Readonly<Record<Provenance, string>> = {
  observed: 'observé',
  estimated: 'estimé',
  forecast: 'prévu',
};

interface BarPoint {
  readonly time: string;
  readonly value: number | null;
  readonly provenance: Provenance | null;
  readonly model: ModelId | null;
}

function formatHour(iso: string): string {
  const match = /T(\d{2}):/.exec(iso);
  return match?.[1] !== undefined ? `${match[1]}h` : iso;
}

/** « 3,5 mm sur 24 h », ou « au moins 3,5 mm... » quand des heures manquent. */
function totalSentence(points: readonly BarPoint[]): string | null {
  const { total, missing } = windowTotal(points.map((point) => point.value));
  if (total === null) {
    return null;
  }
  const amount = `${formatCompact(Math.round(total * 10) / 10)}\u00a0mm sur ${points.length}\u00a0h`;
  return missing === 0 ? amount : `au moins ${amount} (${missing}\u00a0h sans donnée)`;
}

interface PrecipitationChartProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
}

/**
 * Pluie horaire du modele retenu sur 48 h. Barres pleines pour une mesure,
 * hachurees pour une prevision (DESIGN.md 5) ; cumuls a 24 et 48 h.
 */
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
    // Point de cascade : modele retenu, champs absents completes et nommes.
    const hourly = cascade.points[i] ?? undefined;
    points.push({
      time,
      value: hourly?.precipitation.value ?? null,
      provenance: hourly?.precipitation.provenance ?? null,
      model: hourly === undefined ? null : (hourly.filledFrom.precipitation ?? hourly.model),
    });
  }

  const presentProvenances = (['observed', 'estimated', 'forecast'] as const).filter((provenance) =>
    points.some((point) => point.provenance === provenance),
  );
  const firstDay = totalSentence(points.slice(0, 24));
  const whole = points.length > 24 ? totalSentence(points) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const solid = cssVar('--observe') || ink();
    const hatched = hachurePattern(ink(), 5, 1.2);

    const options: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: axisX(8),
        y: { ...axisY('mm'), beginAtZero: true, suggestedMax: MIN_SCALE_MM },
      },
      plugins: {
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            label: (item) => {
              const point = points[item.dataIndex];
              const provenance =
                point?.provenance === null || point?.provenance === undefined
                  ? ''
                  : `, ${PROVENANCE_LABELS[point.provenance]}`;
              const model =
                point?.model === null || point?.model === undefined
                  ? ''
                  : ` par ${MODEL_LABELS[point.model]}`;
              return `${formatCompact(point?.value ?? null)} mm${provenance}${model}`;
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
            backgroundColor: points.map((p) => (p.provenance === 'observed' ? solid : hatched)),
            // Filet d'encre en tete de barre : la hauteur se lit meme hachuree.
            borderColor: ink(),
            borderWidth: { top: 1.5, right: 0, bottom: 0, left: 0 },
            borderSkipped: 'bottom',
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
      {firstDay !== null && (
        <p className={styles.total}>
          Cumul prévu : {firstDay}
          {whole !== null && `, et ${whole}`}.
        </p>
      )}
      <canvas ref={canvasRef} role="img" aria-label="Précipitations horaires sur 48 heures" />
      <ul className={styles.legend} aria-label="Légende">
        {presentProvenances.map((provenance) => (
          <li key={provenance}>
            <span
              className={provenance === 'observed' ? styles.swatchSolid : styles.swatchHatched}
            />{' '}
            {PROVENANCE_LABELS[provenance]}
          </li>
        ))}
      </ul>
      <div className={styles.dataTable}>
        <table>
          <caption>
            Précipitations horaires sur 48 heures, avec le modèle et la provenance de chaque valeur
          </caption>
          <thead>
            <tr>
              <th scope="col">Heure</th>
              <th scope="col">Précipitations</th>
              <th scope="col">Modèle</th>
              <th scope="col">Provenance</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.time}>
                <td>{point.time}</td>
                <td>{point.value === null ? MISSING : `${formatCompact(point.value)} mm`}</td>
                <td>{point.model === null ? MISSING : MODEL_LABELS[point.model]}</td>
                <td>{point.provenance === null ? MISSING : PROVENANCE_LABELS[point.provenance]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
