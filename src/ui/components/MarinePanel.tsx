import type { MarineHourly } from '../../domain/marine';
import { WAVE_OUTLOOK_HOURS } from '../../domain/marine';
import type { WaveOutlook } from '../../domain/marine';
import { MISSING, compassPoint, formatHour, formatOneDecimal } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { SEA_CAVEAT, currentSeaSentence, peakSeaSentence } from '../marinePresentation';
import styles from './MarinePanel.module.css';

interface MarinePanelProps {
  readonly state: DatasetState<MarineHourly>;
  readonly outlook: WaveOutlook | null;
}

/** Une ligne toutes les trois heures, sur les 24 prochaines. */
const ROW_STEP = 3;
const ROW_COUNT = 9;
const TABLE_LABEL = 'Vagues, toutes les trois heures';

/** Mer et houle d'un lieu du littoral : etat courant, pic, et heures a venir. */
export function MarinePanel({ state, outlook }: MarinePanelProps) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <p className={styles.muted}>Lecture des vagues…</p>;
  }
  if (state.status === 'error') {
    return <p className={styles.muted}>Vagues indisponibles pour l’instant.</p>;
  }
  if (outlook === null) {
    return (
      <p className={styles.muted}>
        Le service ne donne pas de vagues pour ce point : il est peut-être trop à l’intérieur des
        terres.
      </p>
    );
  }
  const rows = outlook.hours.filter((_, index) => index % ROW_STEP === 0).slice(0, ROW_COUNT);
  return (
    <div className={styles.panel}>
      <p className={styles.headline}>
        {currentSeaSentence(outlook) ?? 'Hauteur actuelle inconnue.'}
      </p>
      <p>{peakSeaSentence(outlook, WAVE_OUTLOOK_HOURS)}</p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.scroller} role="region" aria-label={TABLE_LABEL} tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Heure</th>
              <th scope="col">Vagues</th>
              <th scope="col">Période</th>
              <th scope="col">Du</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((hour) => (
              <tr key={hour.time}>
                <th scope="row">{formatHour(hour.time)}</th>
                <td data-donnee>
                  {hour.height === null ? MISSING : `${formatOneDecimal(hour.height)}\u00a0m`}
                </td>
                <td data-donnee>
                  {hour.period === null ? MISSING : `${Math.round(hour.period)}\u00a0s`}
                </td>
                <td data-donnee>{compassPoint(hour.direction)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.caption}>{SEA_CAVEAT}</p>
    </div>
  );
}
