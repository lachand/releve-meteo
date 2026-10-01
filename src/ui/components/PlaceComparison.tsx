import { useEffect, useId, useRef, useState } from 'react';
import type { ComparisonHour } from '../../domain/dayDigest';
import type { Place } from '../../domain/types';
import { Chart, TOOLTIP_STYLE, axisX, axisY, faintInk, ink } from '../chartTheme';
import { formatHour, formatOneDecimal } from '../format';
import type { FavouriteSnapshot } from '../hooks/useFavouriteSnapshots';
import { MODEL_LABELS } from '../modelLabels';
import { modelsSentence } from '../comparisonPresentation';
import { cssVar } from '../modelPresentation';
import styles from './PlaceComparison.module.css';

/*
 * Deux lieux cote a cote sur 48 heures : temperature et pluie, chaque lieu
 * selon le modele que sa propre page retiendrait. Le modele de chaque lieu
 * est dit dans la legende et dans l'infobulle de chaque heure : l'ecart entre
 * deux lieux peut venir en partie de deux modeles differents, et le tableau
 * ne doit pas le cacher.
 */

type ReadySnapshot = Extract<FavouriteSnapshot, { readonly status: 'ready' }>;

type Variable = 'temperature' | 'rain';

function displayName(place: Place): string {
  return place.alias ?? place.name;
}

interface Series {
  readonly name: string;
  readonly hours: readonly ComparisonHour[];
}

function ComparisonChart({
  variable,
  first,
  second,
}: {
  readonly variable: Variable;
  readonly first: Series;
  readonly second: Series;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    // Les deux lieux partagent la meme echelle de temps : celle du premier.
    const times = first.hours.map((hour) => hour.time);
    const valueOf = (hours: readonly ComparisonHour[], time: string): ComparisonHour | undefined =>
      hours.find((hour) => hour.time === time);
    const read = (hour: ComparisonHour | undefined): number | null =>
      hour === undefined
        ? null
        : variable === 'temperature'
          ? hour.temperature
          : hour.precipitation;
    const colors = [ink(), cssVar('--marge') || '#ac4336'];
    const bars = variable === 'rain';
    const chart = new Chart(canvas, {
      type: bars ? 'bar' : 'line',
      data: {
        labels: times.map((time) => formatHour(time)),
        datasets: [first, second].map((series, index) => ({
          label: series.name,
          data: times.map((time) => read(valueOf(series.hours, time))),
          borderColor: colors[index] ?? faintInk(),
          backgroundColor: colors[index] ?? faintInk(),
          borderWidth: 2,
          // Le second lieu est tirete : la couleur ne porte pas seule la difference.
          ...(bars
            ? {}
            : { pointRadius: 0, borderDash: index === 1 ? [6, 4] : [], spanGaps: false }),
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: axisX(8),
          y: { ...axisY(bars ? 'mm' : '°C'), beginAtZero: bars },
        },
        plugins: {
          tooltip: {
            ...TOOLTIP_STYLE,
            displayColors: true,
            callbacks: {
              label: (item) => {
                const series = item.datasetIndex === 0 ? first : second;
                const model = valueOf(series.hours, times[item.dataIndex] ?? '')?.model;
                const unit = bars ? 'mm' : '°C';
                return `${series.name} : ${formatOneDecimal(item.parsed.y)} ${unit}${model === undefined ? '' : ` (${MODEL_LABELS[model]})`}`;
              },
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [variable, first, second]);
  const label = variable === 'temperature' ? 'Température' : 'Pluie par heure';
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>{label}</figcaption>
      <div className={styles.chart}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${label}, ${first.name} et ${second.name}, 48 heures`}
        />
      </div>
    </figure>
  );
}

interface PlaceComparisonProps {
  readonly snapshots: readonly FavouriteSnapshot[];
  readonly activePlaceId: string;
}

/** Comparaison de deux favoris sur 48 h ; rien tant que deux lieux n'ont pas leur prevision. */
export function PlaceComparison({ snapshots, activePlaceId }: PlaceComparisonProps) {
  const id = useId().replace(/:/g, '');
  const ready = snapshots.filter(
    (snapshot): snapshot is ReadySnapshot =>
      snapshot.status === 'ready' && snapshot.hours.length > 0,
  );
  // Par defaut : le lieu ouvert (ou le premier favori), contre le suivant.
  const [firstId, setFirstId] = useState<string | null>(null);
  const [secondId, setSecondId] = useState<string | null>(null);
  if (ready.length < 2) {
    return (
      <p className={styles.muted}>
        La comparaison s’affiche dès que la prévision de deux favoris est chargée.
      </p>
    );
  }
  const defaultFirst = ready.find((s) => s.place.id === activePlaceId) ?? ready[0];
  const first = ready.find((s) => s.place.id === firstId) ?? defaultFirst;
  const second =
    ready.find((s) => s.place.id === secondId && s.place.id !== first?.place.id) ??
    ready.find((s) => s.place.id !== first?.place.id);
  if (first === undefined || second === undefined) {
    return null;
  }
  const a: Series = { name: displayName(first.place), hours: first.hours };
  const b: Series = { name: displayName(second.place), hours: second.hours };
  return (
    <div className={styles.comparison}>
      <div className={styles.pickers}>
        <label className={styles.picker} htmlFor={`${id}-a`}>
          <span>Premier lieu</span>
          <select
            id={`${id}-a`}
            value={first.place.id}
            onChange={(e) => setFirstId(e.target.value)}
          >
            {ready.map((s) => (
              <option key={s.place.id} value={s.place.id} disabled={s.place.id === second.place.id}>
                {displayName(s.place)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.picker} htmlFor={`${id}-b`}>
          <span>Second lieu</span>
          <select
            id={`${id}-b`}
            value={second.place.id}
            onChange={(e) => setSecondId(e.target.value)}
          >
            {ready.map((s) => (
              <option key={s.place.id} value={s.place.id} disabled={s.place.id === first.place.id}>
                {displayName(s.place)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className={styles.legend} aria-label="Légende">
        <li data-series="first">
          <span className={styles.swatch} aria-hidden="true" />
          <strong>{a.name}</strong>, trait plein : prévision {modelsSentence(first.hours)}
        </li>
        <li data-series="second">
          <span className={styles.swatch} aria-hidden="true" />
          <strong>{b.name}</strong>, trait tireté : prévision {modelsSentence(second.hours)}
        </li>
      </ul>
      <ComparisonChart variable="temperature" first={a} second={b} />
      <ComparisonChart variable="rain" first={a} second={b} />
      <p className={styles.note}>
        Chaque lieu est tracé selon le modèle que sa propre page retiendrait, heure par heure : une
        partie de l’écart peut venir de deux modèles différents, nommés ci-dessus et dans
        l’infobulle de chaque heure.
      </p>
    </div>
  );
}
