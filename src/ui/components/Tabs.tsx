import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './Tabs.module.css';

export interface TabItem<K extends string> {
  readonly key: K;
  readonly label: string;
  /** Libelle court pour les petits ecrans. */
  readonly short?: string;
}

interface TabsProps<K extends string> {
  readonly items: readonly TabItem<K>[];
  readonly active: K;
  readonly onChange: (key: K) => void;
  readonly label: string;
  readonly idPrefix: string;
}

/**
 * Intercalaires de carnet. Motif ARIA « tabs » : fleches gauche/droite,
 * Debut/Fin, activation automatique ; un seul onglet dans l'ordre de
 * tabulation.
 */
export function Tabs<K extends string>({ items, active, onChange, label, idPrefix }: TabsProps<K>) {
  const refs = useRef(new Map<K, HTMLButtonElement>());

  const focusAt = (index: number) => {
    const item = items[(index + items.length) % items.length];
    if (item === undefined) {
      return;
    }
    onChange(item.key);
    refs.current.get(item.key)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        break;
    }
  };

  return (
    <nav className={styles.bar} aria-label={label}>
      <div className={styles.list} role="tablist" aria-label={label}>
        {items.map((item, index) => {
          const selected = item.key === active;
          return (
            <button
              key={item.key}
              ref={(node) => {
                if (node === null) {
                  refs.current.delete(item.key);
                } else {
                  refs.current.set(item.key, node);
                }
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => onChange(item.key)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className={styles.full}>{item.label}</span>
              <span className={styles.short} aria-hidden="true">
                {item.short ?? item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
