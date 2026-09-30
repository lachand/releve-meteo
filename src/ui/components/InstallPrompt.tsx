import styles from './InstallPrompt.module.css';

interface InstallPromptProps {
  readonly onInstall: () => void;
  readonly onDismiss: () => void;
}

/**
 * Invitation flottante : elle ne fait jamais partie du flux, donc n'en decale
 * aucun element quand `beforeinstallprompt` arrive apres le premier rendu.
 */
export function InstallPrompt({ onInstall, onDismiss }: InstallPromptProps) {
  return (
    <div className={styles.banner} role="status">
      <p>Installer Relevé pour un accès hors ligne plus rapide.</p>
      <div className={styles.actions}>
        <button type="button" onClick={onDismiss}>
          Plus tard
        </button>
        <button type="button" className={styles.primary} onClick={onInstall}>
          Installer
        </button>
      </div>
    </div>
  );
}
