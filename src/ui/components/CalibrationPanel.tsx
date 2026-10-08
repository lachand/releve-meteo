import { useEffect, useState } from 'react';
import { loadCalibration } from '../../data/cache/calibrationStore';
import { calibrationSummary } from '../../domain/calibration';
import type { CalibrationRecord } from '../../domain/calibration';
import { calibrationHeadline, calibrationVerdict, levelLine } from '../calibrationPresentation';
import styles from './CalibrationPanel.module.css';

interface CalibrationPanelProps {
  readonly placeId: string;
  /** Change quand un nouveau jour a pu etre verifie : relit alors le bilan. */
  readonly refreshKey: string;
}

/**
 * La confiance auto-evaluee : quand Relevé disait « confiance elevee » pour la
 * temperature d'un jour, de combien la prevision s'est-elle ecartee de la
 * mesure ? Garde sur cet appareil, jamais recalcule apres coup.
 */
export function CalibrationPanel({ placeId, refreshKey }: CalibrationPanelProps) {
  const [records, setRecords] = useState<readonly CalibrationRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCalibration(placeId).then((loaded) => {
      if (!cancelled) {
        setRecords(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [placeId, refreshKey]);

  if (records === null) {
    return <p className={styles.muted}>Lecture du bilan…</p>;
  }
  const summary = calibrationSummary(records);
  if (summary === null) {
    return (
      <p className={styles.muted}>
        Le bilan commence quand un jour déjà annoncé la veille avec une confiance entre au journal :
        ouvrez ce lieu un jour, une station mesure le lendemain. Relevé n’affirme pas sa confiance
        avant de l’avoir vérifiée.
      </p>
    );
  }
  return (
    <div className={styles.panel}>
      <p className={styles.headline}>{calibrationHeadline(summary)}</p>
      <ul className={styles.levels} aria-label="Erreur selon la confiance annoncée">
        {summary.levels.map((level) => (
          <li key={level.level} data-donnee>
            {levelLine(level)}
          </li>
        ))}
      </ul>
      <p className={styles.verdict}>{calibrationVerdict(summary)}</p>
      <p className={styles.caption}>
        Température seulement, d’après la station la plus proche. La confiance de la pluie et du
        vent n’est pas encore vérifiée.
      </p>
    </div>
  );
}
