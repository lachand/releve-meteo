import type { CSSProperties } from 'react';
import type { BlendedPoint } from '../../domain/modelCascade';
import type { ForecastBundle, Preferences } from '../../domain/types';
import {
  MISSING,
  compassPoint,
  formatCompact,
  formatDayShort,
  formatHour,
  formatInteger,
  formatTemperature,
} from '../format';
import type { CascadeView } from '../hooks/useCascadeView';
import { MODEL_LABELS, modelColorVar } from '../modelPresentation';
import { WeatherSymbol } from '../symbols/WeatherSymbol';
import { WindArrow } from '../symbols/WindArrow';
import { weatherCodeLabel } from '../weatherCodePresentation';
import { convertWindSpeed, windUnitLabel } from '../windUnit';
import styles from './HourlyStrip.module.css';
import { SwitchReasons } from './SwitchReasons';

interface HourlyStripProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
  readonly hours: number;
  readonly windUnit: Preferences['units']['wind'];
  /** Pas en heures entre deux colonnes. */
  readonly step?: number;
  readonly caption: string;
}

interface Column {
  readonly index: number;
  readonly time: string;
  readonly point: BlendedPoint;
  readonly newDay: boolean;
  readonly transition: boolean;
}

/** Seuil sous lequel la ligne de probabilite de pluie est omise, %. */
const PROBABILITY_WORTH_SHOWING = 10;

/** Echelle de la barre de pluie : 8 mm/h remplit la case. */
const RAIN_FULL_SCALE_MM = 8;

function columnsOf(
  bundle: ForecastBundle,
  cascade: CascadeView,
  hours: number,
  step: number,
): Column[] {
  const start = cascade.nowIndex === -1 ? 0 : cascade.nowIndex;
  const columns: Column[] = [];
  let previousDate: string | null = null;
  let previousModel: string | null = null;
  for (let i = start; i < Math.min(start + hours, bundle.timeline.length); i += step) {
    const point = cascade.points[i];
    const time = bundle.timeline[i];
    if (point === null || point === undefined || time === undefined) {
      continue;
    }
    const date = time.slice(0, 10);
    columns.push({
      index: i,
      time,
      point,
      newDay: previousDate !== null && date !== previousDate,
      transition: previousModel !== null && point.model !== previousModel,
    });
    previousDate = date;
    previousModel = point.model;
  }
  return columns;
}

export function HourlyStrip({
  bundle,
  cascade,
  hours,
  windUnit,
  step = 1,
  caption,
}: HourlyStripProps) {
  const columns = columnsOf(bundle, cascade, hours, step);
  if (columns.length === 0) {
    return <p className={styles.empty}>Aucune échéance couverte par un modèle.</p>;
  }
  const unit = windUnitLabel(windUnit);
  const firstShown = columns[0]?.index ?? 0;
  const lastShown = columns.at(-1)?.index ?? 0;
  // La probabilite n'apporte rien quand elle reste partout sous 10 %.
  const showProbability = columns.some((c) => {
    const probability = c.point.precipitationProbability.value;
    return probability !== null && probability >= PROBABILITY_WORTH_SHOWING;
  });

  return (
    // Zone defilante horizontalement : elle doit etre atteignable au clavier
    // pour defiler sans souris (regle axe scrollable-region-focusable).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={styles.scroller} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="row" className={styles.rowHead}>
              Heure
            </th>
            {columns.map((c) => (
              <th
                key={c.index}
                scope="col"
                className={styles.col}
                data-new-day={c.newDay || undefined}
                data-transition={c.transition || undefined}
              >
                {c.newDay && <span className={styles.day}>{formatDayShort(c.time)}</span>}
                <span className={styles.hour}>{formatHour(c.time)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className={styles.rowHead}>
              Temps
            </th>
            {columns.map((c) => (
              <td key={c.index} className={styles.col} data-new-day={c.newDay || undefined}>
                <WeatherSymbol
                  code={c.point.weatherCode}
                  cloudCover={c.point.cloudCover.value}
                  isDay={c.point.isDay}
                  size={30}
                />
                {weatherCodeLabel(c.point.weatherCode) === null && (
                  <span className="visually-hidden">temps non fourni</span>
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={styles.rowHead}>
              °C
            </th>
            {columns.map((c) => (
              <td
                key={c.index}
                className={`${styles.col} ${styles.temperature}`}
                data-new-day={c.newDay || undefined}
                data-donnee
              >
                {formatTemperature(c.point.temperature.value)}
                {c.point.temperature.value !== null && '°'}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={styles.rowHead}>
              Pluie
            </th>
            {columns.map((c) => {
              const mm = c.point.precipitation.value;
              const height = mm === null ? 0 : Math.min(1, mm / RAIN_FULL_SCALE_MM);
              return (
                <td key={c.index} className={styles.col} data-new-day={c.newDay || undefined}>
                  <span className={styles.rainCell}>
                    <span
                      className={mm !== null && mm > 0 ? styles.rainBar : styles.rainBarDry}
                      style={{ '--h': `${Math.round(height * 100)}%` } as CSSProperties}
                      aria-hidden="true"
                    />
                    <span data-donnee className={mm !== null && mm > 0 ? styles.wet : styles.dry}>
                      {mm === null ? MISSING : formatCompact(mm)}
                    </span>
                  </span>
                </td>
              );
            })}
          </tr>
          {showProbability && (
            <tr>
              <th scope="row" className={styles.rowHead}>
                Proba.
              </th>
              {columns.map((c) => (
                <td key={c.index} className={styles.col} data-new-day={c.newDay || undefined}>
                  <span className={styles.small} data-donnee>
                    {c.point.precipitationProbability.value === null
                      ? MISSING
                      : `${formatInteger(c.point.precipitationProbability.value)}%`}
                  </span>
                </td>
              ))}
            </tr>
          )}
          <tr>
            <th scope="row" className={styles.rowHead}>
              Vent
            </th>
            {columns.map((c) => {
              const speed = convertWindSpeed(c.point.windSpeed.value, windUnit);
              const gust = convertWindSpeed(c.point.windGust.value, windUnit);
              return (
                <td key={c.index} className={styles.col} data-new-day={c.newDay || undefined}>
                  <WindArrow
                    speedKmh={c.point.windSpeed.value}
                    directionDeg={c.point.windDirection.value}
                    size={30}
                  />
                  <span className={styles.small} data-donnee>
                    {formatInteger(speed)}
                    <span className="visually-hidden"> {unit}</span>
                  </span>
                  {gust !== null && (
                    <span className={styles.gust} data-donnee>
                      <span className="visually-hidden">rafales </span>
                      {formatInteger(gust)}
                    </span>
                  )}
                  {c.point.windDirection.value !== null && (
                    <span className={styles.windFrom}>
                      du {compassPoint(c.point.windDirection.value)}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
          <tr>
            <th scope="row" className={styles.rowHead}>
              Modèle
            </th>
            {columns.map((c) => (
              <td
                key={c.index}
                className={`${styles.col} ${styles.modelCell}`}
                data-new-day={c.newDay || undefined}
                data-transition={c.transition || undefined}
                style={{ '--model': modelColorVar(c.point.model) } as CSSProperties}
              >
                <span className={styles.modelRule} aria-hidden="true" />
                <span
                  className={
                    c.transition || c === columns[0] ? styles.modelName : 'visually-hidden'
                  }
                >
                  {MODEL_LABELS[c.point.model]}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className={styles.legend}>
        Vent en {unit}, rafales en petit. La flèche montre où va le vent, plus épaisse quand il
        forcit ; « du SO » dit d’où il vient. Un filet tireté marque chaque changement de modèle.
      </p>
      <SwitchReasons
        timeline={bundle.timeline}
        switches={cascade.switches.filter(
          (entry) => entry.index >= firstShown && entry.index <= lastShown,
        )}
        title="Pourquoi le modèle change ici"
      />
    </div>
  );
}
