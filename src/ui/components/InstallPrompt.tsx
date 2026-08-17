import styles from './InstallPrompt.module.css';

interface InstallPromptProps {
  readonly onInstall: () => void;
}

export function InstallPrompt({ onInstall }: InstallPromptProps) {
  return (
    <div className={styles.banner} role="status">
      <p>Installer Relevé pour un accès hors ligne plus rapide.</p>
      <button type="button" onClick={onInstall}>
        Installer
      </button>
    </div>
  );
}
