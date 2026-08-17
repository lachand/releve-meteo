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
import { useEffect, useRef, useState } from 'react';
import { spreadBand } from '../../domain/confidence';
import type { ForecastBundle, ModelId, WeatherVariable } from '../../domain/types';
import { cascadeBoundHours } from '../modelExplanation';
import { MODEL_LABELS, cssVar, modelColor } from '../modelPresentation';
import styles from './ComparisonView.module.css';

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

const CASCADE_ORDER: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];

const VARIABLE_LABELS: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'Température',
  wind: 'Vent',
  precipitation: 'Précipitations',
};

const VARIABLE_UNITS: Readonly<Record<WeatherVariable, string>> = {
  temperature: '°C',
  wind: 'km/h',
  precipitation: 'mm',
};

// Une texture distincte par modele, en complement de la couleur : dans ce
// mode la confiance n'a plus de sens (chaque modele est regarde seul), la
// convention de trait change donc explicitement (DESIGN.md 6.3).
const MODEL_DASH: Readonly<Record<ModelId, number[]>> = {
  arome: [],
  arpege: [6, 3],
  icon_eu: [2, 2],
  gfs: [8, 3, 2, 3],
};

const WINDOW_OPTIONS = [48, 72, 168] as const;

function fieldValue(
  bundle: ForecastBundle,
  model: ModelId,
  index: number,
  variable: WeatherVariable,
): number | null {
  const point = bundle.series[model]?.hourly[index];
  if (point === undefined) {
    return null;
  }
  switch (variable) {
    case 'temperature':
      return point.temperature.value;
    case 'wind':
      return point.windSpeed.value;
    case 'precipitation':
      return point.precipitation.value;
  }
}

function formatHour(iso: string): string {
  const match = /T(\d{2}):/.exec(iso);
  return match?.[1] !== undefined ? `${match[1]}h` : iso;
}

function formatDayHour(iso: string): string {
  const [datePart, timePart] = iso.split('T');
  const weekday = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long' }).format(
    new Date(`${datePart}T12:00:00Z`),
  );
  return `${weekday} ${timePart?.slice(0, 2) ?? ''}h`;
}

interface ComparisonViewProps {
  readonly bundle: ForecastBundle;
  readonly nowIndex: number;
  readonly onClose: () => void;
}

export function ComparisonView({ bundle, nowIndex, onClose }: ComparisonViewProps) {
  const [variable, setVariable] = useState<WeatherVariable>('temperature');
  const [windowHours, setWindowHours] = useState<number>(72);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);

  const start = nowIndex === -1 ? 0 : nowIndex;
  const end = Math.min(start + windowHours, bundle.timeline.length);
  const visibleTimeline = bundle.timeline.slice(start, end);
  const availableModels = CASCADE_ORDER.filter((model) => bundle.series[model] !== undefined);

  const band = spreadBand(bundle, variable).slice(start, end);
  let maxSpreadIndex = -1;
  let maxSpread = -Infinity;
  band.forEach((b, i) => {
    if (b.min !== null && b.max !== null) {
      const spread = b.max - b.min;
      if (spread > maxSpread) {
        maxSpread = spread;
        maxSpreadIndex = i;
      }
    }
  });
  const summary =
    maxSpreadIndex === -1
      ? "Pas assez de modèles disponibles pour comparer l'écart."
      : `Écart maximal ${maxSpread.toFixed(1)} ${VARIABLE_UNITS[variable]} ${formatDayHour(
          visibleTimeline[maxSpreadIndex] ?? '',
        )}. Les modèles ne s'accordent pas sur cette échéance.`;

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
          title: { display: true, text: VARIABLE_UNITS[variable] },
          grid: { color: cssVar('--grille-faible') },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) =>
              `${MODEL_LABELS[availableModels[item.datasetIndex] as ModelId]} : ${item.formattedValue} ${VARIABLE_UNITS[variable]}`,
          },
        },
      },
    };

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels: visibleTimeline.map((t) => formatHour(t)),
        datasets: availableModels.map((model) => ({
          label: MODEL_LABELS[model],
          data: visibleTimeline.map((_, i) => fieldValue(bundle, model, start + i, variable)),
          borderColor: modelColor(model),
          borderDash: MODEL_DASH[model],
          borderWidth: 2,
          pointRadius: 0,
          spanGaps: false,
        })),
      },
      options,
    });

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleTimeline/availableModels derives de bundle+nowIndex+windowHours+variable a chaque rendu
  }, [bundle, nowIndex, windowHours, variable]);

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <h2>Comparer les modèles</h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>

      <div className={styles.controls}>
        <label>
          Variable
          <select
            value={variable}
            onChange={(event) => setVariable(event.target.value as WeatherVariable)}
          >
            <option value="temperature">Température</option>
            <option value="wind">Vent</option>
            <option value="precipitation">Précipitations</option>
          </select>
        </label>
        <label>
          Échéance
          <select
            value={windowHours}
            onChange={(event) => setWindowHours(Number(event.target.value))}
          >
            {WINDOW_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                {hours} h
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.wrapper}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${VARIABLE_LABELS[variable]} comparée entre modèles sur ${windowHours} heures`}
        />
      </div>

      <ul className={styles.legend}>
        {availableModels.map((model) => (
          <li key={model}>
            <span
              className={styles.swatch}
              style={{
                borderTopColor: modelColor(model),
                borderTopStyle: MODEL_DASH[model].length === 0 ? 'solid' : 'dashed',
              }}
            />
            {MODEL_LABELS[model]} jusqu'à {cascadeBoundHours(model)} h
          </li>
        ))}
      </ul>

      <p className={styles.summary}>{summary}</p>

      <table className={styles.dataTable}>
        <caption>
          {VARIABLE_LABELS[variable]} par modèle sur {windowHours} heures
        </caption>
        <thead>
          <tr>
            <th scope="col">Heure</th>
            {availableModels.map((model) => (
              <th scope="col" key={model}>
                {MODEL_LABELS[model]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleTimeline.map((time, i) => (
            <tr key={time}>
              <td>{time}</td>
              {availableModels.map((model) => {
                const value = fieldValue(bundle, model, start + i, variable);
                return (
                  <td key={model}>
                    {value === null ? '—' : `${value} ${VARIABLE_UNITS[variable]}`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
