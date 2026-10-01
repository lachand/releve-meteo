import { useEffect, useRef } from 'react';
import { MODEL_ORDER } from '../../domain/models';
import { weeklyComparison } from '../../domain/reliability';
import type { DailyError, ModelVerification } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { Chart, TOOLTIP_STYLE, axisX, axisY } from '../chartTheme';
import { formatDayMonth, formatOneDecimal } from '../format';
import { weeklySentence } from '../historyPresentation';
import { MODEL_LABELS, modelColor } from '../modelPresentation';
import styles from './ReliabilityPanel.module.css';

interface Row {
  readonly model: ModelId;
  readonly daily: readonly DailyError[];
}

/** Erreur par jour de la temperature prevue la veille, un modele par ligne. */
function rowsOf(verification: readonly ModelVerification[]): readonly Row[] {
  return MODEL_ORDER.flatMap((model) => {
    const entry = verification.find(
      (v) => v.model === model && v.variable === 'temperature' && v.leadDays === 1,
    );
    return entry?.daily == null ? [] : [{ model, daily: entry.daily }];
  });
}

function DailyChart({ rows }: { readonly rows: readonly Row[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const dates = [...new Set(rows.flatMap((row) => row.daily.map((d) => d.date)))].sort();
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: dates.map((date) => formatDayMonth(date)),
        datasets: rows.map(({ model, daily }) => ({
          label: MODEL_LABELS[model],
          // Un jour sans assez de mesures reste un trou, jamais un zero.
          data: dates.map((date) => daily.find((d) => d.date === date)?.mae ?? null),
          borderColor: modelColor(model),
          backgroundColor: modelColor(model),
          borderWidth: 2,
          pointRadius: 2,
          spanGaps: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { x: axisX(6), y: { ...axisY('°C'), beginAtZero: true } },
        plugins: {
          tooltip: {
            ...TOOLTIP_STYLE,
            displayColors: true,
            callbacks: {
              label: (item) =>
                `${item.dataset.label ?? ''} : ${formatOneDecimal(item.parsed.y)} °C`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [rows]);
  return (
    <div className={styles.chart}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Erreur moyenne de température par modèle et par jour, prévue la veille"
      />
    </div>
  );
}

interface ReliabilityHistoryProps {
  readonly verification: readonly ModelVerification[];
}

/**
 * Historique de fiabilite : le classement tient-il d'une semaine a l'autre ?
 * Construit sur la fenetre de verification deja lue, sans requete de plus.
 */
export function ReliabilityHistory({ verification }: ReliabilityHistoryProps) {
  const rows = rowsOf(verification);
  const comparison = weeklyComparison(rows);
  const days = Math.max(0, ...rows.map((row) => row.daily.length));
  if (comparison === null && days < 2) {
    return null;
  }
  return (
    <div className={styles.periods}>
      <h4 className={styles.subheading}>Historique de fiabilité</h4>
      {comparison !== null && <p className={styles.headline}>{weeklySentence(comparison)}</p>}
      <p className={styles.caption}>
        Erreur absolue moyenne de la température prévue la veille, jour par jour. Un jour sans assez
        de mesures n’est pas tracé.
      </p>
      {days >= 2 && <DailyChart rows={rows} />}
    </div>
  );
}
