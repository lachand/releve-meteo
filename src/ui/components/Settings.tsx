import { useState } from 'react';
import type { Preferences } from '../../domain/types';
import styles from './Settings.module.css';

interface SettingsProps {
  readonly preferences: Preferences;
  readonly onSetWindUnit: (wind: Preferences['units']['wind']) => void;
  readonly onSetTheme: (theme: Preferences['theme']) => void;
  readonly onPurge: () => Promise<void>;
  readonly onClose: () => void;
}

export function Settings({
  preferences,
  onSetWindUnit,
  onSetTheme,
  onPurge,
  onClose,
}: SettingsProps) {
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [purged, setPurged] = useState(false);

  async function handlePurgeClick(): Promise<void> {
    if (!confirmingPurge) {
      setConfirmingPurge(true);
      return;
    }
    await onPurge();
    setConfirmingPurge(false);
    setPurged(true);
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <h2>Réglages</h2>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>

      <section className={styles.section}>
        <p className="eyebrow">Unités</p>
        <label className={styles.field}>
          Vitesse du vent
          <select
            value={preferences.units.wind}
            onChange={(event) => onSetWindUnit(event.target.value as Preferences['units']['wind'])}
          >
            <option value="kmh">km/h</option>
            <option value="kt">nœuds</option>
          </select>
        </label>
      </section>

      <section className={styles.section}>
        <p className="eyebrow">Thème</p>
        <label className={styles.field}>
          Apparence
          <select
            value={preferences.theme}
            onChange={(event) => onSetTheme(event.target.value as Preferences['theme'])}
          >
            <option value="auto">Automatique</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>
      </section>

      <section className={styles.section}>
        <p className="eyebrow">Données locales</p>
        <p className={styles.explanation}>
          Efface les prévisions et communes en cache, les favoris, et remet les réglages à zéro sur
          cet appareil. Ne touche à rien côté serveur, il n'y en a pas.
        </p>
        <button
          type="button"
          className={confirmingPurge ? styles.purgeButtonConfirm : styles.purgeButton}
          onClick={() => {
            void handlePurgeClick();
          }}
        >
          {confirmingPurge ? 'Confirmer la purge' : 'Purger les données locales'}
        </button>
        {purged && <p className={styles.status}>Données locales effacées.</p>}
      </section>
    </div>
  );
}
