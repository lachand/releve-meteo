import { fogRisk, frostRisk } from '../../domain/derived';
import type { DailyPoint, HourlyPoint } from '../../domain/types';
import styles from './ConditionsPanel.module.css';

interface ConditionsPanelProps {
  readonly nowPoint: HourlyPoint | null;
  readonly today: DailyPoint | null;
}

const RISK_LABELS: Readonly<Record<ReturnType<typeof frostRisk>, string>> = {
  none: 'aucun',
  possible: 'possible',
  likely: 'probable',
};

const numberFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

function formatHour(iso: string | null): string {
  if (iso === null) {
    return '—';
  }
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match?.[1] !== undefined ? `${match[1]}` : iso;
}

function fogRiskFor(point: HourlyPoint | null): ReturnType<typeof fogRisk> | null {
  if (point === null) {
    return null;
  }
  const { value: temperatureC } = point.temperature;
  const { value: dewPointC } = point.dewPoint;
  const { value: windSpeedKmh } = point.windSpeed;
  if (temperatureC === null || dewPointC === null || windSpeedKmh === null) {
    return null;
  }
  return fogRisk({ temperatureC, dewPointC, windSpeedKmh });
}

/** Point de rosee, risques de gel et de brouillard, UV, lever/coucher du soleil (BACKLOG.md Lot 5). */
export function ConditionsPanel({ nowPoint, today }: ConditionsPanelProps) {
  const dewPointValue = nowPoint?.dewPoint.value ?? null;
  const frost = frostRisk(today?.tempMin.value ?? null);
  const fog = fogRiskFor(nowPoint);

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>Repères du jour</caption>
      <tbody>
        <tr>
          <td>point de rosée</td>
          <td>{dewPointValue === null ? '—' : `${numberFr.format(dewPointValue)} °C`}</td>
        </tr>
        <tr>
          <td>risque de gel</td>
          <td>{RISK_LABELS[frost]}</td>
        </tr>
        <tr>
          <td>risque de brouillard</td>
          <td>{fog === null ? '—' : RISK_LABELS[fog]}</td>
        </tr>
        <tr>
          <td>indice UV</td>
          <td>
            {today === null || today.uvIndexMax.value === null
              ? '—'
              : numberFr.format(today.uvIndexMax.value)}
          </td>
        </tr>
        <tr>
          <td>lever du soleil</td>
          <td>{formatHour(today?.sunrise ?? null)}</td>
        </tr>
        <tr>
          <td>coucher du soleil</td>
          <td>{formatHour(today?.sunset ?? null)}</td>
        </tr>
      </tbody>
    </table>
  );
}
