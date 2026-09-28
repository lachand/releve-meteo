import type { CSSProperties } from 'react';
import type { BlendedDay } from '../../domain/dailyBlend';
import type { EnsembleDay } from '../../domain/ensemble';
import type { Preferences } from '../../domain/types';
import {
  MISSING,
  compassPoint,
  formatCompact,
  formatDayMonth,
  formatInteger,
  formatPercent,
  formatTemperature,
  formatWeekday,
} from '../format';
import { MODEL_LABELS, modelColorVar } from '../modelPresentation';
import { WeatherSymbol } from '../symbols/WeatherSymbol';
import { weatherCodeLabel } from '../weatherCodePresentation';
import { convertWindSpeed, windUnitLabel } from '../windUnit';
import styles from './DailyList.module.css';

interface DailyListProps {
  readonly days: readonly BlendedDay[];
  readonly ensemble: readonly EnsembleDay[] | null;
  readonly windUnit: Preferences['units']['wind'];
  readonly today: string;
}

function range(days: readonly BlendedDay[]): { min: number; max: number } | null {
  const values: number[] = [];
  for (const day of days) {
    if (day.tempMin.value !== null) {
      values.push(day.tempMin.value);
    }
    if (day.tempMax.value !== null) {
      values.push(day.tempMax.value);
    }
  }
  if (values.length === 0) {
    return null;
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Journées à venir : symbole, fourchette de température sur une échelle
 * commune (lecture d'un coup d'œil des tendances), cumul et durée de
 * pluie, rafale maximale, modèle retenu, et, quand l'ensemble ECMWF est
 * disponible, la probabilité de pluie qu'il donne.
 */
export function DailyList({ days, ensemble, windUnit, today }: DailyListProps) {
  if (days.length === 0) {
    return <p className={styles.empty}>Aucune journée complète couverte par un modèle.</p>;
  }
  const scale = range(days);
  const unit = windUnitLabel(windUnit);
  const ensembleByDate = new Map((ensemble ?? []).map((day) => [day.date, day]));

  return (
    <ol className={styles.list}>
      {days.map((day) => {
        const min = day.tempMin.value;
        const max = day.tempMax.value;
        const span = scale === null ? 1 : Math.max(1, scale.max - scale.min);
        const left = scale === null || min === null ? 0 : ((min - scale.min) / span) * 100;
        const right = scale === null || max === null ? 100 : ((max - scale.min) / span) * 100;
        const ens = ensembleByDate.get(day.date);
        const condition = weatherCodeLabel(day.weatherCode);
        const gust = convertWindSpeed(day.windGustMax.value, windUnit);
        return (
          <li key={day.date} className={styles.row}>
            <div className={styles.date}>
              <span className={styles.weekday}>
                {day.date === today ? 'Aujourd’hui' : formatWeekday(day.date)}
              </span>
              <span className={styles.dayMonth}>{formatDayMonth(day.date)}</span>
            </div>
            <div className={styles.symbol} title={condition ?? undefined}>
              <WeatherSymbol code={day.weatherCode} size={34} />
              {condition === null && <span className="visually-hidden">temps non fourni</span>}
            </div>
            <div className={styles.temps}>
              <span className={styles.min} data-donnee>
                {formatTemperature(min)}°
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.bar}
                  style={{ '--l': `${left}%`, '--r': `${100 - right}%` } as CSSProperties}
                />
              </span>
              <span className={styles.max} data-donnee>
                {formatTemperature(max)}°
              </span>
            </div>
            <div className={styles.meta}>
              <div className={styles.rain}>
                <span data-donnee className={styles.rainValue}>
                  {formatCompact(day.precipitationSum.value)}
                  <span className="unit">mm</span>
                </span>
                <span className={styles.detail}>
                  {day.precipitationHours.value !== null && day.precipitationHours.value > 0
                    ? `${formatInteger(day.precipitationHours.value)} h de pluie`
                    : 'sec'}
                  {ens?.rainProbability !== undefined && ens.rainProbability !== null && (
                    <> · ens. {formatPercent(ens.rainProbability)}</>
                  )}
                </span>
              </div>
              <div className={styles.wind}>
                <span data-donnee>
                  {gust === null ? MISSING : formatInteger(gust)}
                  {gust !== null && <span className="unit">{unit}</span>}
                </span>
                <span className={styles.detail}>
                  raf. max · {compassPoint(day.windDirectionDominant.value)}
                </span>
              </div>
              <div
                className={styles.model}
                style={{ '--model': modelColorVar(day.model) } as CSSProperties}
              >
                <span className={styles.modelDot} aria-hidden="true" />
                {MODEL_LABELS[day.model]}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
