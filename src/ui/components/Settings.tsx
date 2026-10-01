import { useState } from 'react';
import type { Preferences } from '../../domain/types';
import type { BackgroundWatch } from '../hooks/useBackgroundWatch';
import { DiagnosticPanel } from './DiagnosticPanel';
import styles from './Settings.module.css';
import { WatchSettings } from './WatchSettings';

interface SettingsProps {
  readonly preferences: Preferences;
  readonly onSetWindUnit: (wind: Preferences['units']['wind']) => void;
  readonly onSetTheme: (theme: Preferences['theme']) => void;
  /** Lecture rapide ; absente, la case n'est pas montree. */
  readonly onSetQuickReading?: (quick: boolean) => void;
  /** Puissance crete solaire ; absente, la section n'est pas montree. */
  readonly onSetPeakKwp?: (peakKwp: number | null) => void;
  readonly onPurge: () => Promise<void>;
  readonly onClose: () => void;
  /** Veille en arriere-plan ; absente, la section n'est pas montree. */
  readonly watch?: BackgroundWatch;
}

export function Settings({
  preferences,
  onSetWindUnit,
  onSetTheme,
  onSetQuickReading,
  onSetPeakKwp,
  onPurge,
  onClose,
  watch,
}: SettingsProps) {
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [peakText, setPeakText] = useState(() => String(preferences.solar.peakKwp ?? ''));
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

      {onSetQuickReading !== undefined && (
        <section className={styles.section}>
          <p className="eyebrow">Lecture</p>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={preferences.display.quick}
              onChange={(event) => onSetQuickReading(event.target.checked)}
            />
            <span>
              Lecture rapide : l’accueil ne garde que le bulletin du moment, la pluie au quart
              d’heure et le créneau sec, en grand. Les vigilances et vos alertes restent affichées,
              et toutes les autres vues restent à un onglet.
            </span>
          </label>
        </section>
      )}

      {onSetPeakKwp !== undefined && (
        <section className={styles.section}>
          <p className="eyebrow">Solaire (facultatif)</p>
          <label className={styles.field}>
            Puissance crête installée (kWc)
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={peakText}
              onChange={(event) => {
                setPeakText(event.target.value);
                const text = event.target.value.trim().replace(',', '.');
                onSetPeakKwp(text === '' ? null : Number(text));
              }}
            />
          </label>
          <p className={styles.explanation}>
            Laissez vide pour ne rien afficher. La production est une estimation, pas une mesure :
            le rayonnement prévu converti par cette puissance, avec 20 % de pertes forfaitaires,
            sans tenir compte de l’orientation ni des masques. Enregistrée sur cet appareil.
          </p>
        </section>
      )}

      {watch !== undefined && <WatchSettings watch={watch} />}

      <DiagnosticPanel />

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
