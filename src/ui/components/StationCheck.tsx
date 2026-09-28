import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { StationReport } from '../../data/repository';
import { STATION_CHECK } from '../../domain/stationCheck';
import type { ModelGap, StationCheck } from '../../domain/stationCheck';
import { STATION_MATCH } from '../../domain/stations';
import type { StationMatch } from '../../domain/stations';
import type { ModelId, Preferences } from '../../domain/types';
import {
  MISSING,
  compassPoint,
  formatCompact,
  formatDuration,
  formatHour,
  formatInteger,
  formatOneDecimal,
  formatSignedOneDecimal,
} from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { MODEL_LABELS, modelColorVar } from '../modelPresentation';
import { convertWindSpeed, windUnitLabel } from '../windUnit';
import styles from './StationCheck.module.css';

/*
 * Controle au dernier releve : la mesure de la station representative du
 * lieu face aux modeles. Deux formes : une ligne sous « Maintenant »
 * (vue Aujourd'hui) et le detail modele par modele (vue Fiabilite).
 */

/** En deca, l'ecart est dans l'arrondi des releves au degre. */
const NEGLIGIBLE_GAP_C = 0.5;

function elevationPhrase(delta: number | null): string {
  if (delta === null) {
    return 'altitude inconnue';
  }
  const rounded = Math.round(delta);
  if (Math.abs(rounded) < 10) {
    return 'même altitude';
  }
  return `${formatInteger(Math.abs(rounded))} m plus ${rounded > 0 ? 'haut' : 'bas'}`;
}

function stationPhrase(match: StationMatch): string {
  return `${formatCompact(match.distanceKm)} km du lieu, ${elevationPhrase(match.elevationDelta)}`;
}

function gapPhrase(gap: number): string {
  if (Math.abs(gap) < NEGLIGIBLE_GAP_C) {
    return 'au plus près de la mesure';
  }
  return gap > 0 ? 'trop chaud' : 'trop froid';
}

function Pastille() {
  return <span className={styles.pastille} aria-hidden="true" />;
}

type StationState = DatasetState<StationReport>;

/** Phrase d'etat quand aucun controle n'est possible, ou null s'il l'est. */
function unavailableSentence(state: StationState, check: StationCheck | null): string | null {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return 'Lecture du dernier relevé de la station…';
    case 'error':
      return 'Relevé de station indisponible pour l’instant.';
    case 'ready':
      if (state.value.match === null) {
        return `Aucune station de mesure représentative (moins de ${STATION_MATCH.maxDistanceKm} km et ${STATION_MATCH.maxElevationDeltaM} m de dénivelé) : pas de contrôle au réel pour ce lieu.`;
      }
      if (check === null) {
        return `La station ${state.value.match.station.name} n’a publié aucun relevé de température ces 36 dernières heures.`;
      }
      return null;
  }
}

interface StationLineProps {
  readonly state: StationState;
  readonly check: StationCheck | null;
  readonly activeModel: ModelId | null;
  readonly onDetail: () => void;
}

/** Ligne de controle sous « Maintenant ». */
export function StationLine({ state, check, activeModel, onDetail }: StationLineProps) {
  const unavailable = unavailableSentence(state, check);
  if (unavailable !== null || check === null || state.status !== 'ready') {
    return <p className={styles.lineMuted}>{unavailable}</p>;
  }
  const match = state.value.match;
  const active = check.gaps.find((gap) => gap.model === activeModel) ?? null;
  return (
    <div className={styles.line}>
      <p>
        <Pastille />
        Mesuré à <strong>{match?.station.name}</strong> à {formatHour(check.latest.time)} :{' '}
        <strong>
          <span data-donnee>{formatCompact(check.latest.temperature.value)}</span>
          {'\u00a0°C'}
        </strong>
        <span className={styles.age}> (il y a {formatDuration(check.ageMinutes)})</span>.{' '}
        {active !== null && active.temperature !== null && active.gap !== null && (
          <>
            {MODEL_LABELS[active.model]} donnait{' '}
            <span data-donnee>{formatOneDecimal(active.temperature)}</span>
            {'\u00a0°C'} ici à la même heure (écart{' '}
            <span data-donnee>{formatSignedOneDecimal(active.gap)}</span>
            {'\u00a0°C'}).
          </>
        )}
      </p>
      {check.stale && (
        <p className={styles.caveat}>
          Relevé ancien : la station publie avec retard, l’écart ne dit rien de la dernière heure.
        </p>
      )}
      <button type="button" className={styles.link} onClick={onDetail}>
        Tous les modèles face à la mesure
      </button>
    </div>
  );
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

function GapRow({ gap, active }: { readonly gap: ModelGap; readonly active: boolean }) {
  return (
    <tr
      data-active={active || undefined}
      style={{ '--model': modelColorVar(gap.model) } as CSSProperties}
    >
      <th scope="row" className={styles.model}>
        <span className={styles.modelName}>
          <span className={styles.dot} aria-hidden="true" />
          {MODEL_LABELS[gap.model]}
        </span>
        {active && <span className={styles.tag}>retenu</span>}
      </th>
      <td data-donnee className={styles.number}>
        {formatOneDecimal(gap.temperature)}
      </td>
      <td data-donnee className={styles.number}>
        {formatSignedOneDecimal(gap.gap)}
      </td>
      <td>
        {gap.recentMeanGap === null ? (
          <span className={styles.muted}>trop peu d’heures</span>
        ) : (
          <>
            <span data-donnee className={styles.number}>
              {formatSignedOneDecimal(gap.recentMeanGap)}
            </span>
            <span className={styles.verdict}>{gapPhrase(gap.recentMeanGap)}</span>
          </>
        )}
      </td>
    </tr>
  );
}

interface StationCheckPanelProps {
  readonly state: StationState;
  readonly check: StationCheck | null;
  readonly activeModel: ModelId | null;
  readonly windUnit: Preferences['units']['wind'];
}

/** Detail du controle : releve complet et ecart de chaque modele. */
export function StationCheckPanel({ state, check, activeModel, windUnit }: StationCheckPanelProps) {
  const captionId = `${useId().replace(/:/g, '')}-ecarts`;
  const unavailable = unavailableSentence(state, check);
  if (unavailable !== null || check === null || state.status !== 'ready') {
    return <p className={styles.muted}>{unavailable}</p>;
  }
  const match = state.value.match;
  const { latest } = check;
  const unit = windUnitLabel(windUnit);
  const speed = convertWindSpeed(latest.windSpeed.value, windUnit);
  const gust = convertWindSpeed(latest.windGust.value, windUnit);
  const hour = formatHour(latest.time);

  return (
    <div className={styles.panel}>
      <p className={styles.source}>
        <Pastille />
        Station <strong>{match?.station.name}</strong>
        {match !== null && `, à ${stationPhrase(match)}`}. Relevé de {hour}, il y a{' '}
        {formatDuration(check.ageMinutes)}.
      </p>

      <dl className={styles.readings} aria-label={`Mesures de ${hour}`}>
        <Reading label="Température" value={formatCompact(latest.temperature.value)} unit="°C" />
        <Reading label="Humidité" value={formatInteger(latest.humidity.value)} unit="%" />
        <div className={styles.reading}>
          <dt>Vent</dt>
          <dd data-donnee>
            {speed === null ? (
              MISSING
            ) : (
              <>
                {compassPoint(latest.windDirection.value)} {formatInteger(speed)}
                <span className="unit">{unit}</span>
              </>
            )}
          </dd>
        </div>
        <Reading label="Rafales" value={formatInteger(gust)} unit={unit} />
        <Reading label="Pression" value={formatInteger(latest.pressure.value)} unit="hPa" />
        <Reading label="Pluie" value={formatCompact(latest.precipitation.value)} unit="mm/h" />
      </dl>

      {/* Legende hors de la zone defilante : elle ne s'elargit jamais avec le tableau. */}
      <p id={captionId} className={styles.caption}>
        Température de chaque modèle au lieu, en °C, face à la mesure, du plus proche au plus
        éloigné. L’écart est la valeur du modèle moins la mesure.
      </p>
      <div className={styles.scroller}>
        <table className={styles.table} aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col">Modèle</th>
              <th scope="col">À {hour}</th>
              <th scope="col">Écart</th>
              <th scope="col">Sur {STATION_CHECK.recentHours} h</th>
            </tr>
          </thead>
          <tbody>
            {check.gaps.map((gap) => (
              <GapRow key={gap.model} gap={gap} active={gap.model === activeModel} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className={styles.notes}>
        <li>
          Les valeurs des modèles sont leurs dernières sorties pour ces heures, pas des prévisions
          émises la veille : l’écart dit qui colle à la situation du moment. La prévision à J+1 et
          au-delà est jugée plus bas, sur trente jours.
        </li>
        {match !== null && (
          <li>
            La station est à {stationPhrase(match)} : une part de l’écart peut tenir à la distance.
          </li>
        )}
        <li>
          Relevés Meteostat (METAR, SYNOP), souvent arrondis au degré et publiés avec quelques
          heures de retard. Un champ vide n’a pas été mesuré, il n’est jamais remplacé par une
          prévision.
        </li>
      </ul>
    </div>
  );
}
