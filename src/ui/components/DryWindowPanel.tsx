import { DRY_WINDOW } from '../../domain/dryWindow';
import type { DryWindow } from '../../domain/dryWindow';
import type { Preferences } from '../../domain/types';
import { dryWindowSentence } from '../dryWindowPresentation';
import { formatCompact, formatInteger } from '../format';
import { convertWindSpeed, windUnitLabel } from '../windUnit';
import styles from './DryWindowPanel.module.css';

/*
 * Meilleur creneau sec de la fin de journee. Les criteres sont ecrits :
 * ce qui compte pour « sec » n'est jamais une convention cachee.
 */

interface DryWindowPanelProps {
  readonly window: DryWindow;
  readonly windUnit: Preferences['units']['wind'];
}

export function DryWindowPanel({ window, windUnit }: DryWindowPanelProps) {
  const gust = convertWindSpeed(DRY_WINDOW.gustKmh, windUnit);
  return (
    <div className={styles.panel} data-status={window.status}>
      <p className={styles.sentence}>{dryWindowSentence(window)}</p>
      <p className={styles.criteria}>
        Créneau de jour où il tombe au plus {formatCompact(DRY_WINDOW.rainMm)}
        {'\u00a0'}mm par heure, avec des rafales sous {formatInteger(gust)}
        {'\u00a0'}
        {windUnitLabel(windUnit)}, d’au moins {DRY_WINDOW.minHours} heures.
      </p>
    </div>
  );
}
