import { useEffect, useRef } from 'react';
import type { TemperatureSpaghetti } from '../../domain/ensemble';
import { Chart, TOOLTIP_STYLE, axisX, axisY, faintInk, ink } from '../chartTheme';
import { formatDayHour, formatHour, formatTemperature } from '../format';
import styles from './EnsembleSpaghetti.module.css';

interface EnsembleSpaghettiProps {
  /** null : ensemble en chargement ou indisponible. */
  readonly spaghetti: TemperatureSpaghetti | null;
}

/**
 * Les trajectoires de temperature de chaque membre de l'ensemble ECMWF, en
 * traits fins et clairs, avec la mediane en trait plein et le fuseau de neuf
 * membres sur dix en pointilles. Ce que l'on voit, c'est l'incertitude : quand
 * les traits s'ecartent, la prevision de temperature est moins sure. Prevision,
 * pas mesure.
 */
export function EnsembleSpaghetti({ spaghetti }: EnsembleSpaghettiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || spaghetti === null) {
      return;
    }
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: spaghetti.times.map((time) => formatHour(time)),
        datasets: [
          ...spaghetti.members.map((member) => ({
            data: [...member],
            borderColor: faintInk(),
            borderWidth: 1,
            pointRadius: 0,
            spanGaps: false,
            order: 3,
          })),
          {
            label: '9 membres sur 10 au plus',
            data: [...spaghetti.p90],
            borderColor: ink(),
            borderDash: [4, 4],
            borderWidth: 1.25,
            pointRadius: 0,
            spanGaps: false,
            order: 2,
          },
          {
            label: '9 membres sur 10 au moins',
            data: [...spaghetti.p10],
            borderColor: ink(),
            borderDash: [4, 4],
            borderWidth: 1.25,
            pointRadius: 0,
            spanGaps: false,
            order: 2,
          },
          {
            label: 'Médiane',
            data: [...spaghetti.median],
            borderColor: ink(),
            borderWidth: 2.5,
            pointRadius: 0,
            spanGaps: false,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: { x: axisX(8), y: axisY('°C') },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            // Les 51 traits fins ne sont pas listes : la mediane et le fuseau suffisent.
            filter: (item) => item.dataset.label !== undefined,
            callbacks: {
              label: (item) =>
                item.parsed.y === null
                  ? `${item.dataset.label ?? ''} : aucune valeur`
                  : `${item.dataset.label ?? ''} : ${formatTemperature(item.parsed.y)} °C`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [spaghetti]);

  if (spaghetti === null) {
    return (
      <p className={styles.caption}>
        L’ensemble ECMWF se charge ou n’est pas disponible : pas de trajectoires de température pour
        l’instant.
      </p>
    );
  }
  const widest = spaghetti.widest;
  return (
    <figure className={styles.figure}>
      <div className={styles.chart}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Trajectoires de température des ${spaghetti.members.length} membres de l’ensemble ECMWF sur 72 heures`}
        />
      </div>
      <figcaption className={styles.caption}>
        {widest === null ? null : (
          <>
            {formatDayHour(widest.time)}, neuf membres sur dix annoncent entre{' '}
            <span data-donnee>{formatTemperature(widest.p10)} °C</span> et{' '}
            <span data-donnee>{formatTemperature(widest.p90)} °C</span>.{' '}
          </>
        )}
        Chaque trait fin est un membre de l’ensemble ECMWF : une trajectoire plausible. Le trait
        épais est la médiane, les pointillés encadrent neuf membres sur dix. Plus les traits
        s’écartent, moins la température est sûre. Prévision, pas mesure.
      </figcaption>
    </figure>
  );
}
