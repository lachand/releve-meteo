import styles from './UpdateBanner.module.css';

interface UpdateBannerProps {
  readonly onRefresh: () => void;
}

export function UpdateBanner({ onRefresh }: UpdateBannerProps) {
  return (
    <div className={styles.banner} role="status">
      <p>Une nouvelle version est disponible.</p>
      <button type="button" onClick={onRefresh}>
        Actualiser
      </button>
    </div>
  );
}
