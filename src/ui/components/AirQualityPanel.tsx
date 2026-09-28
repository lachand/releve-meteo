import type { AirQualitySeries, PollenKind } from '../../data/clients/airQuality';
import {
  POLLEN_LABELS,
  airQualityIndexAt,
  aqiLabel,
  dailyMax,
  pollenLevel,
} from '../airQualityPresentation';
import { MISSING, formatCompact, formatInteger } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import styles from './AirQualityPanel.module.css';

interface AirQualityPanelProps {
  readonly state: DatasetState<AirQualitySeries>;
  /** Heure locale courante 'YYYY-MM-DDTHH:00'. */
  readonly hour: string;
}

const POLLENS: readonly PollenKind[] = ['grass', 'birch', 'alder', 'olive', 'mugwort', 'ragweed'];

export function AirQualityPanel({ state, hour }: AirQualityPanelProps) {
  if (state.status === 'idle') {
    return null;
  }
  if (state.status === 'loading') {
    return (
      <div
        className={styles.skeleton}
        aria-busy="true"
        aria-label="Chargement de la qualité de l'air"
      />
    );
  }
  if (state.status === 'error') {
    return <p className={styles.muted}>Qualité de l’air indisponible pour le moment.</p>;
  }
  const series = state.value;
  const index = airQualityIndexAt(series, hour);
  const at = (values: readonly (number | null)[]) =>
    index === -1 ? null : (values[index] ?? null);
  const aqi = at(series.europeanAqi);
  const date = hour.slice(0, 10);
  const uvMax = dailyMax(series, series.uvIndex, date);
  const pollens = POLLENS.map((kind) => ({
    kind,
    value: dailyMax(series, series.pollen[kind], date),
  })).filter((p) => p.value !== null && p.value >= 1);

  return (
    <div className={styles.panel}>
      <p className={styles.aqi}>
        <span className={styles.aqiValue} data-donnee>
          {formatInteger(aqi)}
        </span>
        <span>
          <span className={styles.aqiLabel}>{aqiLabel(aqi) ?? MISSING}</span>
          <span className={styles.caption}>indice européen, maintenant</span>
        </span>
      </p>
      <dl className={styles.grid}>
        <div>
          <dt>PM2,5</dt>
          <dd data-donnee>
            {formatCompact(at(series.pm2_5))}
            <span className="unit">µg/m³</span>
          </dd>
        </div>
        <div>
          <dt>PM10</dt>
          <dd data-donnee>
            {formatCompact(at(series.pm10))}
            <span className="unit">µg/m³</span>
          </dd>
        </div>
        <div>
          <dt>Ozone</dt>
          <dd data-donnee>
            {formatInteger(at(series.ozone))}
            <span className="unit">µg/m³</span>
          </dd>
        </div>
        <div>
          <dt>NO₂</dt>
          <dd data-donnee>
            {formatInteger(at(series.nitrogenDioxide))}
            <span className="unit">µg/m³</span>
          </dd>
        </div>
        <div>
          <dt>UV max</dt>
          <dd data-donnee>{formatCompact(uvMax)}</dd>
        </div>
      </dl>
      <p className={styles.pollens}>
        {pollens.length === 0
          ? 'Pollens : aucun en quantité notable aujourd’hui.'
          : `Pollens : ${pollens
              .map((p) => `${POLLEN_LABELS[p.kind].toLowerCase()} ${pollenLevel(p.value) ?? ''}`)
              .join(', ')}.`}
      </p>
      <p className={styles.caption}>Prévision CAMS Europe (Copernicus)</p>
    </div>
  );
}
