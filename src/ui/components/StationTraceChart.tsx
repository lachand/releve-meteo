import { Chart } from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { MODEL_ORDER } from '../../domain/models';
import type { StationTrace } from '../../domain/stationTrace';
import type { ModelId } from '../../domain/types';
import { TOOLTIP_STYLE, axisX, axisY, ink } from '../chartTheme';
import { formatDayHour, formatDayShort, formatHour, formatOneDecimal } from '../format';
import { MODEL_LABELS, modelColor, modelColorVar } from '../modelPresentation';
import { driftSentence } from '../stationTracePresentation';
import styles from './StationTraceChart.module.css';

/*
 * Mesure de la station et temperature de chaque modele au meme point,
 * heure par heure. La mesure est le trait d'encre plein, marque d'un
 * point a chaque releve (provenance observee) ; les modeles portent leur
 * couleur, le modele retenu est plus epais.
 */

interface StationTraceChartProps {
  readonly trace: StationTrace;
  readonly activeModel: ModelId | null;
  readonly stationName: string;
}

export function StationTraceChart({ trace, activeModel, stationName }: StationTraceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const models = MODEL_ORDER.filter((model) => trace.byModel[model] !== undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: axisX(8),
        y: axisY('°C'),
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          displayColors: true,
          callbacks: {
            title: (items) => {
              const time = trace.timeline[items[0]?.dataIndex ?? -1];
              return time === undefined ? '' : formatDayHour(time);
            },
            label: (item) => `${item.dataset.label ?? ''} : ${item.formattedValue} °C`,
          },
        },
      },
    };
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        // Minuit porte le jour : « lun. 28 », plus utile que « 00h » sur 36 heures.
        labels: trace.timeline.map((time) =>
          time.endsWith('T00:00') ? formatDayShort(time.slice(0, 10)) : formatHour(time),
        ),
        datasets: [
          ...models.map((model) => ({
            label: MODEL_LABELS[model],
            data: [...(trace.byModel[model] ?? [])],
            borderColor: modelColor(model),
            backgroundColor: modelColor(model),
            borderWidth: model === activeModel ? 2.6 : 1.4,
            pointRadius: 0,
            pointHoverRadius: 3,
            spanGaps: false,
            order: 1,
          })),
          {
            label: `Mesure, ${stationName}`,
            data: [...trace.observed],
            borderColor: ink(),
            backgroundColor: ink(),
            borderWidth: 2,
            pointRadius: 3,
            pointStyle: 'circle' as const,
            spanGaps: false,
            order: 0,
          },
        ],
      },
      options,
    });
    return () => {
      chart.destroy();
    };
    // Les intrants sont l'objet `trace`, recree a chaque nouvelle mesure.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- models derive de trace.
  }, [trace, activeModel, stationName]);

  const first = trace.timeline[0];
  const last = trace.timeline.at(-1);
  return (
    <div className={styles.wrapper}>
      <div className={styles.chart}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Température mesurée à ${stationName} et prévue par chaque modèle, de ${first === undefined ? '' : formatHour(first)} à ${last === undefined ? '' : formatHour(last)}`}
        />
      </div>
      <ul className={styles.key} aria-label="Légende du graphique">
        <li>
          <span className={styles.measured} aria-hidden="true" />
          Mesure de la station
        </li>
        {models.map((model) => (
          <li key={model} style={{ '--model': modelColorVar(model) } as CSSProperties}>
            <span className={styles.line} data-active={model === activeModel || undefined} />
            {MODEL_LABELS[model]}
            {model === activeModel && <span className={styles.tag}>retenu</span>}
          </li>
        ))}
      </ul>

      <ul className={styles.drifts} aria-label="Dérive de chaque modèle">
        {trace.drifts.map((drift) => (
          <li key={drift.model} style={{ '--model': modelColorVar(drift.model) } as CSSProperties}>
            <span className={styles.name}>
              <span className={styles.dot} aria-hidden="true" />
              {MODEL_LABELS[drift.model]}
            </span>
            <span>{driftSentence(drift)}</span>
          </li>
        ))}
      </ul>

      <div className={styles.dataTable}>
        <table>
          <caption>Température heure par heure, mesure et modèles</caption>
          <thead>
            <tr>
              <th scope="col">Heure</th>
              <th scope="col">Mesure</th>
              {models.map((model) => (
                <th key={model} scope="col">
                  {MODEL_LABELS[model]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trace.timeline.map((time, index) => (
              <tr key={time}>
                <th scope="row">{formatHour(time)}</th>
                <td>{formatOneDecimal(trace.observed[index] ?? null)}</td>
                {models.map((model) => (
                  <td key={model}>{formatOneDecimal(trace.byModel[model]?.[index] ?? null)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
