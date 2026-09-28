import type { ConfidenceVerdict } from '../../domain/confidence';
import type { BlendedPoint } from '../../domain/modelCascade';
import type { Preferences } from '../../domain/types';
import { describeFilledFrom } from '../fieldPresentation';
import { MISSING, compassPoint, formatCompact, formatInteger, formatOneDecimal } from '../format';
import { CONFIDENCE_LEVEL_LABELS, MODEL_LABELS } from '../modelPresentation';
import type { SelectionExplanation } from '../selectionExplanation';
import { WeatherSymbol } from '../symbols/WeatherSymbol';
import { WindBarb } from '../symbols/WindBarb';
import { weatherCodeLabel } from '../weatherCodePresentation';
import { convertWindSpeed, windUnitLabel } from '../windUnit';
import { ModelStamp } from './ModelStamp';
import styles from './NowPanel.module.css';

interface NowPanelProps {
  readonly point: BlendedPoint | null;
  readonly confidence: ConfidenceVerdict | null;
  readonly windUnit: Preferences['units']['wind'];
  readonly explanation: SelectionExplanation;
  readonly manual: boolean;
  readonly onExplain: () => void;
}

function Reading({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className={styles.reading}>
      <dt>{label}</dt>
      <dd data-donnee>
        {value}
        {unit !== undefined && value !== MISSING && <span className="unit">{unit}</span>}
      </dd>
    </div>
  );
}

export function NowPanel({
  point,
  confidence,
  windUnit,
  explanation,
  manual,
  onExplain,
}: NowPanelProps) {
  if (point === null) {
    return (
      <p className={styles.empty}>
        Aucun modèle ne couvre l’instant présent pour ce lieu. Les échéances suivantes restent
        consultables dans l’onglet « Heures ».
      </p>
    );
  }

  const condition = weatherCodeLabel(point.weatherCode);
  const unit = windUnitLabel(windUnit);
  const speed = convertWindSpeed(point.windSpeed.value, windUnit);
  const gust = convertWindSpeed(point.windGust.value, windUnit);
  const visibilityKm = point.visibility.value === null ? null : point.visibility.value / 1000;
  const octas = point.cloudCover.value === null ? null : Math.round(point.cloudCover.value / 12.5);
  const filled = describeFilledFrom(point.filledFrom);

  return (
    <div className={styles.panel}>
      <div className={styles.main}>
        <div className={styles.headline}>
          <WeatherSymbol
            code={point.weatherCode}
            cloudCover={point.cloudCover.value}
            size={72}
            className={styles.symbol}
            decorative
          />
          <div>
            <p className={styles.temperature} data-donnee>
              {formatOneDecimal(point.temperature.value)}
              <span className={styles.degree}>°C</span>
            </p>
            <p className={styles.condition}>
              {condition ?? 'Temps présent non fourni'}
              {point.apparentTemperature.value !== null && (
                <>
                  {' · '}ressenti{' '}
                  <span
                    data-donnee
                  >{`${formatInteger(point.apparentTemperature.value)}\u00a0°C`}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <dl className={styles.readings}>
          <div className={styles.reading}>
            <dt>Vent</dt>
            <dd data-donnee className={styles.wind}>
              <WindBarb
                speedKmh={point.windSpeed.value}
                directionDeg={point.windDirection.value}
                size={30}
              />
              <span>
                {compassPoint(point.windDirection.value)} {formatInteger(speed)}
                {speed !== null && <span className="unit">{unit}</span>}
              </span>
            </dd>
          </div>
          <Reading label="Rafales" value={formatInteger(gust)} unit={unit} />
          <Reading label="Humidité" value={formatInteger(point.humidity.value)} unit="%" />
          <Reading label="Rosée" value={formatOneDecimal(point.dewPoint.value)} unit="°C" />
          <Reading label="Pression" value={formatInteger(point.pressure.value)} unit="hPa" />
          <Reading label="Nébulosité" value={octas === null ? MISSING : `${octas}/8`} />
          <Reading label="Visibilité" value={formatCompact(visibilityKm)} unit="km" />
          <Reading label="Pluie" value={formatCompact(point.precipitation.value)} unit="mm/h" />
        </dl>
      </div>

      <aside className={styles.margin} aria-label="Modèle retenu et justification">
        <ModelStamp model={point.model} manual={manual} />
        <p className={`note ${styles.justification}`}>{explanation.headline}</p>
        <ul className={styles.reasons}>
          {explanation.reasons.slice(0, 2).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {confidence !== null && confidence.level !== 'unavailable' && (
          <p className={styles.confidence}>
            Confiance {CONFIDENCE_LEVEL_LABELS[confidence.level].toLowerCase()} :{' '}
            {confidence.modelCount} modèles comparés à cette heure.
          </p>
        )}
        {filled !== null && (
          <p className={styles.filled}>
            Complété, faute de donnée chez {MODEL_LABELS[point.model]} : {filled}.
          </p>
        )}
        <button type="button" className={styles.explain} onClick={onExplain}>
          Pourquoi ce modèle ?
        </button>
      </aside>
    </div>
  );
}
