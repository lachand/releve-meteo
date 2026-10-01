import { useEffect, useRef } from 'react';
import type { RainOutlookHour } from '../../domain/ensemble';
import { Chart, TOOLTIP_STYLE, axisX, axisY, hachurePattern, ink } from '../chartTheme';
import { formatHour, formatOneDecimal, formatPercent } from '../format';
import styles from './RainOutlookChart.module.css';

interface RainOutlookChartProps {
  /** null : ensemble en chargement ou indisponible. */
  readonly hours: readonly RainOutlookHour[] | null;
  readonly memberCount: number;
}

/**
 * Probabilite de pluie heure par heure : la part des membres de l'ensemble
 * ECMWF qui annoncent de la pluie. Ce n'est pas une certitude de modele
 * unique mais un desaccord mesure entre trajectoires plausibles ; barres
 * hachurees, car c'est une prevision. Une heure sans membre reste vide.
 */
export function RainOutlookChart({ hours, memberCount }: RainOutlookChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || hours === null || hours.length === 0) {
      return;
    }
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: hours.map((hour) => formatHour(hour.time)),
        datasets: [
          {
            data: hours.map((hour) => (hour.probability === null ? null : hour.probability * 100)),
            backgroundColor: hachurePattern(ink(), 6, 1.5),
            borderColor: ink(),
            borderWidth: 1,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { x: axisX(8), y: { ...axisY('%'), min: 0, max: 100 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TOOLTIP_STYLE,
            callbacks: {
              label: (item) => {
                const hour = hours[item.dataIndex];
                if (hour === undefined || hour.probability === null) {
                  return 'aucun membre';
                }
                const amounts =
                  hour.median === null || hour.p90 === null
                    ? ''
                    : `, cumul probable ${formatOneDecimal(hour.median)} mm, jusqu’à ${formatOneDecimal(hour.p90)} mm dans 1 cas sur 10`;
                return `${formatPercent(hour.probability)} des membres annoncent de la pluie${amounts}`;
              },
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [hours]);

  if (hours === null || hours.length === 0) {
    return (
      <p className={styles.caption}>
        L’ensemble ECMWF se charge ou n’est pas disponible : pas de probabilité de pluie pour
        l’instant.
      </p>
    );
  }
  return (
    <figure className={styles.figure}>
      <div className={styles.chart}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Probabilité de pluie heure par heure sur 72 heures, ensemble ECMWF"
        />
      </div>
      <figcaption className={styles.caption}>
        Part des {memberCount} membres de l’ensemble ECMWF qui annoncent 0,1 mm ou plus à cette
        heure. Plus la barre est haute, plus les trajectoires s’accordent sur de la pluie ; une
        barre à mi-hauteur dit que les modèles se partagent. Prévision, pas mesure.
      </figcaption>
    </figure>
  );
}
