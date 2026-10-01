import { useEffect, useState } from 'react';
import { loadJournal } from '../../data/cache/journalStore';
import { JOURNAL, summarizeJournal } from '../../domain/journal';
import type { JournalEntry } from '../../domain/journal';
import { formatInteger, formatLongDate, formatOneDecimal } from '../format';
import { journalErrorLine, journalHeadline } from '../journalPresentation';
import { MODEL_LABELS } from '../modelPresentation';
import styles from './JournalPanel.module.css';

interface JournalPanelProps {
  readonly placeId: string;
  /** Change quand un nouveau bilan a pu etre enregistre : relit alors le journal. */
  readonly refreshKey: string;
}

/**
 * Journal des previsions : le bilan « hier, prevu contre reel » de chaque jour,
 * garde sur cet appareil au-dela de la fenetre de 30 jours de la verification.
 * Prevu la veille, mesure par la station : jamais recalcule apres coup.
 */
export function JournalPanel({ placeId, refreshKey }: JournalPanelProps) {
  const [entries, setEntries] = useState<readonly JournalEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadJournal(placeId).then((loaded) => {
      if (!cancelled) {
        setEntries(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [placeId, refreshKey]);

  if (entries === null) {
    return <p className={styles.muted}>Lecture du journal…</p>;
  }
  const summary = summarizeJournal(entries);
  if (summary === null) {
    return (
      <p className={styles.muted}>
        Le journal commence avec le prochain bilan d’hier : chaque jour où une station mesure assez,
        Relevé en garde le résultat sur cet appareil.
      </p>
    );
  }
  const captionId = 'journal-legende';
  return (
    <div className={styles.panel}>
      <p className={styles.headline}>{journalHeadline(summary)}</p>
      <ul className={styles.means} aria-label="Erreur moyenne de chaque modèle sur le journal">
        {summary.meanMae.map((row) => (
          <li key={row.model}>
            <strong>{MODEL_LABELS[row.model]}</strong>{' '}
            <span data-donnee>{journalErrorLine(row.mae, row.days)}</span>
          </li>
        ))}
      </ul>
      <p id={captionId} className={styles.caption}>
        Les {Math.min(entries.length, JOURNAL.shownDays)} derniers jours. Chaque jour : ce que la
        station a mesuré, et le modèle dont la prévision de la veille en était la plus proche.
      </p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.scroller} role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className={styles.table} aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col">Mesuré</th>
              <th scope="col">Le plus proche</th>
              <th scope="col">Erreur</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, JOURNAL.shownDays).map((entry) => {
              const best = entry.models[0];
              return (
                <tr key={entry.date}>
                  <th scope="row">{formatLongDate(entry.date)}</th>
                  <td data-donnee>
                    {formatInteger(entry.observedMin)} à {formatInteger(entry.observedMax)}&nbsp;°C
                  </td>
                  <td>{best === undefined ? 'aucun' : MODEL_LABELS[best.model]}</td>
                  <td data-donnee>
                    {best === undefined ? 'aucune' : `${formatOneDecimal(best.mae)}\u00a0°C`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Gardé sur cet appareil seulement, {JOURNAL.maxDays} jours au plus, effacé avec les données
        locales. Un jour où la station n’a pas assez de mesures n’y figure pas. Température
        seulement : le journal ne dit rien des averses ni du vent.
      </p>
    </div>
  );
}
