import { useEffect, useRef, useState } from 'react';
import type { Place } from '../../domain/types';
import styles from './PlaceSwitcher.module.css';

interface PlaceSwitcherProps {
  readonly favourites: readonly Place[];
  readonly activePlaceId: string | null;
  readonly onSelect: (place: Place) => void;
  readonly onReorder: (orderedIds: readonly string[]) => void;
  readonly onRemove: (placeId: string) => void;
  readonly onRename: (placeId: string, alias: string | null) => void;
}

function displayName(place: Place): string {
  return place.alias ?? place.name;
}

/** Bascule entre lieux favoris, DESIGN.md section 6.1 bas d'ecran : pastille pleine sur le lieu actif. */
export function PlaceSwitcher({
  favourites,
  activePlaceId,
  onSelect,
  onReorder,
  onRemove,
  onRename,
}: PlaceSwitcherProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftAlias, setDraftAlias] = useState('');
  const aliasInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renamingId !== null) {
      aliasInputRef.current?.focus();
    }
  }, [renamingId]);

  if (favourites.length === 0) {
    return null;
  }

  function moveBy(index: number, delta: number): void {
    const orderedIds = favourites.map((favourite) => favourite.id);
    const target = index + delta;
    if (target < 0 || target >= orderedIds.length) {
      return;
    }
    const currentId = orderedIds[index];
    const targetId = orderedIds[target];
    if (currentId === undefined || targetId === undefined) {
      return;
    }
    orderedIds[index] = targetId;
    orderedIds[target] = currentId;
    onReorder(orderedIds);
  }

  function startRenaming(place: Place): void {
    setRenamingId(place.id);
    setDraftAlias(place.alias ?? place.name);
  }

  function commitRenaming(placeId: string): void {
    const trimmed = draftAlias.trim();
    onRename(placeId, trimmed.length === 0 ? null : trimmed);
    setRenamingId(null);
  }

  return (
    <nav className={styles.bar} aria-label="Lieux favoris">
      <ul className={styles.list}>
        {favourites.map((place, index) => {
          const active = place.id === activePlaceId;
          return (
            <li key={place.id} className={styles.item}>
              {renamingId === place.id ? (
                <input
                  ref={aliasInputRef}
                  type="text"
                  className={styles.aliasInput}
                  value={draftAlias}
                  aria-label={`Renommer ${place.name}`}
                  onChange={(event) => setDraftAlias(event.target.value)}
                  onBlur={() => commitRenaming(place.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitRenaming(place.id);
                    }
                    if (event.key === 'Escape') {
                      setRenamingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.placeButton}
                  aria-pressed={active}
                  onClick={() => onSelect(place)}
                  onDoubleClick={() => startRenaming(place)}
                >
                  <span aria-hidden="true">{active ? '◉' : '○'}</span> {displayName(place)}
                </button>
              )}

              {renamingId !== place.id && (
                <span className={styles.itemControls}>
                  <button
                    type="button"
                    className={styles.controlButton}
                    disabled={index === 0}
                    onClick={() => moveBy(index, -1)}
                    aria-label={`Deplacer ${displayName(place)} vers le haut`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={styles.controlButton}
                    disabled={index === favourites.length - 1}
                    onClick={() => moveBy(index, 1)}
                    aria-label={`Deplacer ${displayName(place)} vers le bas`}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={() => startRenaming(place)}
                    aria-label={`Renommer ${displayName(place)}`}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={() => onRemove(place.id)}
                    aria-label={`Retirer ${displayName(place)} des favoris`}
                  >
                    ✕
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
