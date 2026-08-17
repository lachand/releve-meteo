import type { HourlyPoint, ModelId } from '../../domain/types';
import { MODEL_LABELS, modelColor } from '../modelPresentation';
import { weatherCodeLabel } from '../weatherCodePresentation';
import styles from './NowBlock.module.css';

interface NowBlockProps {
  readonly point: HourlyPoint | null;
  readonly model: ModelId | null;
}

const COMPASS_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

function arrowForDegrees(degrees: number): string {
  const index = Math.round(degrees / 45) % COMPASS_ARROWS.length;
  return COMPASS_ARROWS[index] ?? '↑';
}

const numberFr = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatMeasure(value: number | null, unit: string, format = numberFr): string {
  return value === null ? '—' : `${format.format(value)} ${unit}`;
}

export function NowBlock({ point, model }: NowBlockProps) {
  if (point === null || model === null) {
    return (
      <p style={{ color: 'var(--encre-faible)' }}>
        Aucune echeance couverte par un modele pour cet instant.
      </p>
    );
  }

  const direction = point.windDirection.value;
  const condition = weatherCodeLabel(point.weatherCode);

  return (
    <div className={styles.block}>
      <div className={styles.readings}>
        <span className={styles.temperature} data-donnee>
          {formatMeasure(point.temperature.value, '°C')}
        </span>
        {condition !== null && <p className={styles.condition}>{condition}</p>}
        <hr className={styles.rule} />
        <div className={styles.secondary}>
          <span>
            {direction !== null ? `${arrowForDegrees(direction)} ` : ''}
            {formatMeasure(point.windSpeed.value, 'km/h')}
          </span>
        </div>
        <div className={styles.secondary}>
          <span>raf. {formatMeasure(point.windGust.value, 'km/h')}</span>
        </div>
        <div className={styles.secondary}>
          <span>{formatMeasure(point.pressure.value, 'hPa', new Intl.NumberFormat('fr-FR'))}</span>
        </div>
      </div>
      <div className={styles.badge} style={{ borderColor: modelColor(model) }}>
        <p className={styles.modelName} style={{ color: modelColor(model) }}>
          {MODEL_LABELS[model]}
        </p>
      </div>
    </div>
  );
}
