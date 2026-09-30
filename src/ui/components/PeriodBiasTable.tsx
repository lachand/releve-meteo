import type { CSSProperties } from 'react';
import { MODEL_ORDER } from '../../domain/models';
import { DAY_PERIODS } from '../../domain/reliability';
import type { ModelVerification } from '../../domain/reliability';
import type { ModelId } from '../../domain/types';
import { formatSignedOneDecimal } from '../format';
import { MODEL_LABELS, modelColorVar } from '../modelPresentation';
import { NOTABLE_BIAS_C, periodSentence } from '../periodPresentation';
import styles from './ReliabilityPanel.module.css';

const PERIOD_HEADINGS = {
  night: 'Nuit',
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
} as const;

interface PeriodBiasTableProps {
  readonly verification: readonly ModelVerification[];
  readonly activeModel: ModelId | null;
}

/**
 * Biais de la temperature prevue la veille (J+1) par moment de la journee.
 * Il dit a quoi s'en tenir, sans retoucher les valeurs affichees ailleurs.
 */
export function PeriodBiasTable({ verification, activeModel }: PeriodBiasTableProps) {
  const rows = MODEL_ORDER.flatMap((model) => {
    const entry = verification.find(
      (v) => v.model === model && v.variable === 'temperature' && v.leadDays === 1,
    );
    return entry?.periods == null ? [] : [{ model, periods: entry.periods }];
  });
  if (rows.length === 0) {
    return null;
  }
  const highlighted = rows.find((row) => row.model === activeModel) ?? rows[0];
  const captionId = 'biais-par-moment-legende';
  return (
    <div className={styles.periods}>
      <h4 className={styles.subheading}>Biais selon le moment de la journée</h4>
      {highlighted !== undefined && (
        <p className={styles.headline}>{periodSentence(highlighted.model, highlighted.periods)}</p>
      )}
      <p id={captionId} className={styles.caption}>
        Écart moyen de la température prévue la veille (prévu moins mesuré, °C), par moment de la
        journée. Les valeurs affichées ailleurs dans l’application ne sont pas corrigées de ces
        écarts.
      </p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.scroller} role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className={styles.table} aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col">Modèle</th>
              {DAY_PERIODS.map((period) => (
                <th key={period.key} scope="col">
                  {PERIOD_HEADINGS[period.key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model} style={{ '--model': modelColorVar(row.model) } as CSSProperties}>
                <th scope="row" className={styles.model}>
                  <span className={styles.dot} aria-hidden="true" />
                  {MODEL_LABELS[row.model]}
                </th>
                {DAY_PERIODS.map((period) => {
                  const found = row.periods.find((p) => p.period.key === period.key);
                  if (found === undefined) {
                    return (
                      <td key={period.key} data-donnee>
                        <span className={styles.muted}>—</span>
                      </td>
                    );
                  }
                  const notable = Math.abs(found.bias) >= NOTABLE_BIAS_C;
                  return (
                    <td key={period.key} data-donnee data-notable={notable || undefined}>
                      {formatSignedOneDecimal(found.bias)}
                      {notable && (
                        <span className="visually-hidden">
                          {found.bias > 0 ? ' (trop chaud)' : ' (trop froid)'}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
