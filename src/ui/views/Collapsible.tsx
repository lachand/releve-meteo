import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
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
  const [printing, setPrinting] = useState(false);

  // Une feuille de registre ne cache rien : tout s'ouvre pendant l'impression,
  // puis chaque feuillet revient a l'etat choisi. L'etat « impression » est
  // distinct du choix de l'utilisateur, qui n'est jamais modifie.
  useEffect(() => {
    const start = () => flushSync(() => setPrinting(true));
    const end = () => flushSync(() => setPrinting(false));
    window.addEventListener('beforeprint', start);
    window.addEventListener('afterprint', end);
    return () => {
      window.removeEventListener('beforeprint', start);
      window.removeEventListener('afterprint', end);
    };
  }, []);

  function onSummaryClick(event: MouseEvent<HTMLElement>): void {
    // Etat entierement controle : le clic natif ne bascule rien tout seul.
    event.preventDefault();
    setOpen(!open);
    writeOpen(id, !open);
  }

  return (
    <section className={styles.sheet}>
      <details className={styles.collapsible} open={open || printing}>
        <summary className={styles.summary} onClick={onSummaryClick}>
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
