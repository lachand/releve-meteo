import type { ReactNode } from 'react';
import styles from './Section.module.css';

interface SectionProps {
  readonly eyebrow: string;
  readonly title?: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Feuillet du carnet : surtitre en petites capitales, titre à la plume. */
export function Section({ eyebrow, title, aside, children, className }: SectionProps) {
  return (
    <section className={className === undefined ? styles.sheet : `${styles.sheet} ${className}`}>
      <header className={styles.head}>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          {title !== undefined && <h2 className={styles.title}>{title}</h2>}
        </div>
        {aside !== undefined && <div className={styles.aside}>{aside}</div>}
      </header>
      {children}
    </section>
  );
}
