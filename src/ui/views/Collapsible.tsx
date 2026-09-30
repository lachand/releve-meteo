import { useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import styles from './Section.module.css';

interface CollapsibleProps {
  /** Identifiant stable : le choix d'ouvrir ou de replier est retenu sur cet appareil. */
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}

const STORAGE_PREFIX = 'meteo-fr:section:';

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    return stored === null ? fallback : stored === 'open';
  } catch {
    return fallback;
  }
}

function writeOpen(id: string, open: boolean): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, open ? 'open' : 'closed');
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite seulement.
  }
}

/**
 * Feuillet secondaire, repliable : le titre reste un intitule de section
 * (h2 dans le sommaire) et le contenu est dans le document meme replie. Le
 * choix est un confort par appareil, jamais une donnee.
 */
export function Collapsible({
  id,
  eyebrow,
  title,
  defaultOpen = false,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));

  function onToggle(event: SyntheticEvent<HTMLDetailsElement>): void {
    const next = event.currentTarget.open;
    setOpen(next);
    writeOpen(id, next);
  }

  return (
    <section className={styles.sheet}>
      <details className={styles.collapsible} open={open} onToggle={onToggle}>
        <summary className={styles.summary}>
          <span className={styles.summaryText}>
            <span className="eyebrow">{eyebrow}</span>
            <h2 className={styles.title}>{title}</h2>
          </span>
          <span className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.body}>{children}</div>
      </details>
    </section>
  );
}
