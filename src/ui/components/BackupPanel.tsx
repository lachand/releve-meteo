import { useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  collectBackup,
  parseBackup,
  restoreBackup,
  summarizeBackup,
} from '../../data/cache/backup';
import type { BackupFailure, ParsedBackup } from '../../data/cache/backup';
import styles from './Settings.module.css';

const FAILURES: Readonly<Record<BackupFailure, string>> = {
  unreadable: 'Ce fichier n’est pas lisible : ce n’est pas un fichier JSON.',
  foreign: 'Ce fichier n’est pas une sauvegarde de Relevé.',
  version: 'Cette sauvegarde vient d’une version de Relevé que cette version ne sait pas lire.',
};

function plural(count: number, one: string, many: string): string {
  return `${count}\u00a0${count > 1 ? many : one}`;
}

interface BackupPanelProps {
  /** Appelé une fois la sauvegarde appliquée : la page se recharge pour tout relire. */
  readonly onRestored: () => void;
}

/**
 * Sauvegarde et restauration des données locales. Le fichier reste chez
 * l'utilisateur : rien n'est envoyé ailleurs, et les clés d'API ne sont pas
 * exportées.
 */
export function BackupPanel({ onRestored }: BackupPanelProps) {
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const exportBackup = async () => {
    const backup = await collectBackup(new Date());
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `releve-sauvegarde-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Sauvegarde exportée.');
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setPending(null);
      setMessage(FAILURES[parsed.failure]);
      return;
    }
    setPending(parsed.backup);
    setMessage(null);
  };

  const apply = async () => {
    if (pending === null) {
      return;
    }
    await restoreBackup(pending, new Date());
    setPending(null);
    setMessage('Sauvegarde restaurée.');
    onRestored();
  };

  const summary = pending === null ? null : summarizeBackup(pending);
  return (
    <section className={styles.section} aria-labelledby="sauvegarde-titre">
      <p className="eyebrow" id="sauvegarde-titre">
        Sauvegarde
      </p>
      <p className={styles.explanation}>
        Exporte vos favoris, alertes, réglages, choix de modèle et notifications dans un fichier que
        vous gardez, pour les retrouver sur un autre appareil. Rien n’est envoyé ailleurs, et les
        clés d’API saisies ici ne sont pas exportées.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.purgeButton} onClick={() => void exportBackup()}>
          Exporter mes données
        </button>
        <label className={styles.purgeButton}>
          Restaurer une sauvegarde
          <input
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(event) => void readFile(event)}
          />
        </label>
      </div>
      {summary !== null && pending !== null && (
        <div role="group" aria-label="Sauvegarde à restaurer">
          <p className={styles.explanation}>
            Cette sauvegarde contient {plural(summary.favourites, 'favori', 'favoris')},{' '}
            {plural(summary.alerts, 'alerte', 'alertes')} et{' '}
            {plural(summary.modelChoices, 'choix de modèle', 'choix de modèle')}
            {summary.ownReadings > 0 &&
              `, plus ${plural(summary.ownReadings, 'saisie de Mon relevé', 'saisies de Mon relevé')}`}
            .
            {pending.dropped > 0 &&
              ` ${plural(pending.dropped, 'élément invalide a été ignoré', 'éléments invalides ont été ignorés')}.`}{' '}
            La restaurer remplace vos favoris, alertes, réglages et choix actuels.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.purgeButtonConfirm}
              onClick={() => void apply()}
            >
              Remplacer mes données
            </button>
            <button type="button" className={styles.purgeButton} onClick={() => setPending(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {message !== null && (
        <p className={styles.status} role="status">
          {message}
        </p>
      )}
    </section>
  );
}
