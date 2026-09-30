import type { ChartOptions } from 'chart.js';
import { useEffect, useRef } from 'react';
import type { SolarOutlook } from '../../domain/solarOutlook';
import { Chart, TOOLTIP_STYLE, axisX, axisY, ink } from '../chartTheme';
import { formatDayHour, formatHour, formatOneDecimal } from '../format';
import { MODEL_LABELS } from '../modelPresentation';
import { solarCriterion, solarDaySentence } from '../solarPresentation';
import styles from './SolarPanel.module.css';

interface SolarPanelProps {
  readonly outlook: SolarOutlook;
  readonly peakKwp: number;
  /** Date locale 'YYYY-MM-DD' d'aujourd'hui. */
  readonly today: string;
}

/**
 * Production solaire estimee sur 48 heures. Toujours presentee comme une
 * estimation : le rayonnement prevu, la puissance crete saisie, des pertes
 * forfaitaires, ni orientation ni masques.
 */
export function SolarPanel({ outlook, peakKwp, today }: SolarPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sentences = outlook.days.map((day) => solarDaySentence(day, today));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const options: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: { x: axisX(8), y: { ...axisY('kW'), beginAtZero: true } },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_STYLE,
          callbacks: {
            title: (items) => {
              const hour = outlook.hours[items[0]?.dataIndex ?? -1];
              return hour === undefined ? '' : formatDayHour(hour.time);
            },
            label: (item) => `${formatOneDecimal(item.parsed.y)} kW estimés`,
          },
        },
      },
    };
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: outlook.hours.map((hour) => formatHour(hour.time)),
        datasets: [
          {
            label: 'Puissance estimée',
            // Une heure sans rayonnement reste un trou, jamais une barre a zero.
            data: outlook.hours.map((hour) => hour.kw),
            backgroundColor: ink(),
            borderWidth: 0,
          },
        ],
      },
      options,
    });
    return () => chart.destroy();
  }, [outlook]);

  return (
    <div className={styles.panel}>
      <ul className={styles.days}>
        {sentences.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>
      <div className={styles.chart}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Puissance solaire estimée heure par heure sur 48 heures, pour ${formatOneDecimal(peakKwp)} kWc. ${sentences.join(' ')}`}
        />
      </div>
      <p className={styles.note}>
        <strong>Estimation, pas une mesure.</strong> Rayonnement prévu par{' '}
        {outlook.models.map((model) => MODEL_LABELS[model]).join(', puis ')}, converti pour{' '}
        {formatOneDecimal(peakKwp)}&nbsp;kWc avec 20&nbsp;% de pertes forfaitaires, sans tenir
        compte de l’orientation ni des masques. {solarCriterion()}
      </p>
    </div>
  );
}
