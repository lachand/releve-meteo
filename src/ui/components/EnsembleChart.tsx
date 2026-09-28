import type { ChartConfiguration } from 'chart.js';
import { useEffect, useRef } from 'react';
import type { EnsembleDay } from '../../domain/ensemble';
import {
  Chart,
  TOOLTIP_STYLE,
  axisX,
  axisY,
  faintInk,
  gridColor,
  hachurePattern,
  ink,
} from '../chartTheme';
import { MISSING, formatDayShort, formatPercent, formatTemperature } from '../format';
import styles from './EnsembleChart.module.css';

interface EnsembleChartProps {
  readonly days: readonly EnsembleDay[];
  readonly memberCount: number;
}

/**
 * Éventail de l'ensemble ECMWF sur 15 jours : pour les maximales et les
 * minimales, bande hachurée P10 à P90 (8 membres sur 10 y sont), trait
 * médian ; en barres, la part des membres qui annoncent au moins 1 mm.
 * La bande s'élargit avec l'échéance : c'est l'incertitude, rendue visible.
 */
export function EnsembleChart({ days, memberCount }: EnsembleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || days.length === 0) {
      return;
    }
    const labels = days.map((d) => formatDayShort(d.date));
    const maxBand = hachurePattern(faintInk(), 6, 1.5);
    const minBand = hachurePattern(faintInk(), 6, 1.5);
    const config: ChartConfiguration<'line' | 'bar'> = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Maximales P90',
            data: days.map((d) => d.tempMax?.p90 ?? null),
            borderWidth: 0,
            pointRadius: 0,
            fill: false,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Maximales P10',
            data: days.map((d) => d.tempMax?.p10 ?? null),
            borderWidth: 0,
            pointRadius: 0,
            fill: { target: 0 },
            backgroundColor: maxBand,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Maximale médiane',
            data: days.map((d) => d.tempMax?.median ?? null),
            borderColor: ink(),
            borderWidth: 2,
            pointRadius: 2.5,
            pointBackgroundColor: ink(),
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Minimales P90',
            data: days.map((d) => d.tempMin?.p90 ?? null),
            borderWidth: 0,
            pointRadius: 0,
            fill: false,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Minimales P10',
            data: days.map((d) => d.tempMin?.p10 ?? null),
            borderWidth: 0,
            pointRadius: 0,
            fill: { target: 3 },
            backgroundColor: minBand,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Minimale médiane',
            data: days.map((d) => d.tempMin?.median ?? null),
            borderColor: faintInk(),
            borderWidth: 2,
            borderDash: [6, 3],
            pointRadius: 2.5,
            pointBackgroundColor: faintInk(),
            yAxisID: 'y',
          },
          {
            type: 'bar',
            label: 'Probabilité de pluie',
            data: days.map((d) => (d.rainProbability === null ? null : d.rainProbability * 100)),
            backgroundColor: gridColor(),
            borderColor: ink(),
            borderWidth: { top: 1.5, left: 0, right: 0, bottom: 0 },
            barPercentage: 0.55,
            // Chart.js dessine d'abord les jeux d'ordre eleve : les barres
            // restent a l'arriere-plan, sous l'eventail et les medianes.
            order: 2,
            yAxisID: 'rain',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: axisX(15),
          y: { ...axisY('°C'), position: 'left' },
          rain: {
            ...axisY('% pluie'),
            position: 'right',
            min: 0,
            max: 100,
            grid: { display: false },
          },
        },
        plugins: {
          tooltip: {
            ...TOOLTIP_STYLE,
            filter: (item) => item.datasetIndex === 2,
            callbacks: {
              label: (item) => {
                const day = days[item.dataIndex];
                if (day === undefined) {
                  return '';
                }
                return [
                  `Max ${formatTemperature(day.tempMax?.median ?? null)} °C (${formatTemperature(day.tempMax?.p10 ?? null)} à ${formatTemperature(day.tempMax?.p90 ?? null)})`,
                  `Min ${formatTemperature(day.tempMin?.median ?? null)} °C (${formatTemperature(day.tempMin?.p10 ?? null)} à ${formatTemperature(day.tempMin?.p90 ?? null)})`,
                  `Pluie ≥ 1 mm : ${formatPercent(day.rainProbability)}`,
                ];
              },
            },
          },
        },
      },
    };
    const chart = new Chart(canvas, config);
    return () => chart.destroy();
  }, [days]);

  if (days.length === 0) {
    return <p className={styles.empty}>Ensemble indisponible pour ce lieu.</p>;
  }

  return (
    <figure className={styles.figure}>
      <div className={styles.wrapper}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Éventail de l'ensemble ECMWF sur ${days.length} jours : températures maximales et minimales avec leur incertitude, probabilité de pluie`}
        />
      </div>
      <figcaption className={styles.legend}>
        <span>
          <span className={styles.swatchLine} /> maximale médiane
        </span>
        <span>
          <span className={styles.swatchDashed} /> minimale médiane
        </span>
        <span>
          <span className={styles.swatchHachure} /> 8 membres sur 10 (P10 à P90)
        </span>
        <span>
          <span className={styles.swatchBar} /> probabilité de pluie ≥ 1 mm
        </span>
        <span className={styles.members}>ECMWF ENS, {memberCount} membres</span>
      </figcaption>
      <div className="visually-hidden">
        <table>
          <caption>Ensemble ECMWF, quantiles journaliers</caption>
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col">Max médiane</th>
              <th scope="col">Max P10 à P90</th>
              <th scope="col">Min médiane</th>
              <th scope="col">Min P10 à P90</th>
              <th scope="col">Pluie ≥ 1 mm</th>
              <th scope="col">Pluie ≥ 10 mm</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{formatTemperature(d.tempMax?.median ?? null)} °C</td>
                <td>
                  {d.tempMax === null
                    ? MISSING
                    : `${formatTemperature(d.tempMax.p10)} à ${formatTemperature(d.tempMax.p90)} °C`}
                </td>
                <td>{formatTemperature(d.tempMin?.median ?? null)} °C</td>
                <td>
                  {d.tempMin === null
                    ? MISSING
                    : `${formatTemperature(d.tempMin.p10)} à ${formatTemperature(d.tempMin.p90)} °C`}
                </td>
                <td>{formatPercent(d.rainProbability)}</td>
                <td>{formatPercent(d.heavyRainProbability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
