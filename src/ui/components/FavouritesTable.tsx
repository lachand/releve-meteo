import { useState } from 'react';
import type { Place, Preferences } from '../../domain/types';
import { MISSING, formatCompact, formatInteger, formatTemperature } from '../format';
import type { FavouriteSnapshot } from '../hooks/useFavouriteSnapshots';
import { MODEL_LABELS } from '../modelLabels';
import { convertWindSpeed, windUnitLabel } from '../windUnit';
import styles from './FavouritesTable.module.css';

/*
 * Tableau de comparaison des favoris : la valeur du moment, puis, sur les
 * 24 prochaines heures, les extremes, le cumul de pluie et la rafale
 * maximale, et le modele qui les donne. Triable par colonne ; une valeur absente est un
 * tiret et passe toujours en dernier, jamais un zero.
 */

type SortKey = 'name' | 'now' | 'range' | 'rain' | 'gust';
type Direction = 'ascending' | 'descending';

type ReadySnapshot = Extract<FavouriteSnapshot, { readonly status: 'ready' }>;

interface Column {
  readonly key: SortKey;
  readonly label: string;
  readonly unit?: string;
}

function displayName(place: Place): string {
  return place.alias ?? place.name;
}

/** Valeur de tri d'une ligne ; null : pas de valeur, la ligne va en dernier. */
function sortValue(snapshot: FavouriteSnapshot, key: SortKey): number | string | null {
  if (key === 'name') {
    return displayName(snapshot.place);
  }
  if (snapshot.status !== 'ready') {
    return null;
  }
  switch (key) {
    case 'now':
      return snapshot.point?.temperature.value ?? null;
    case 'range':
      return snapshot.digest?.tempMax ?? null;
    case 'rain':
      return snapshot.digest?.rainMm ?? null;
    case 'gust':
      return snapshot.digest?.gustMax ?? null;
  }
}

function sorted(
  snapshots: readonly FavouriteSnapshot[],
  key: SortKey | null,
  direction: Direction,
): readonly FavouriteSnapshot[] {
  if (key === null) {
    return snapshots;
  }
  const sign = direction === 'ascending' ? 1 : -1;
  return snapshots
    .map((snapshot, index) => ({ snapshot, index, value: sortValue(snapshot, key) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        // Les lieux sans valeur restent en dernier, dans leur ordre d'origine.
        return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1;
      }
      const order =
        typeof a.value === 'string' && typeof b.value === 'string'
          ? a.value.localeCompare(b.value, 'fr')
          : Number(a.value) - Number(b.value);
      return order === 0 ? a.index - b.index : sign * order;
    })
    .map((entry) => entry.snapshot);
}

function Cells({
  snapshot,
  windUnit,
}: {
  readonly snapshot: ReadySnapshot;
  readonly windUnit: Preferences['units']['wind'];
}) {
  const { digest, point, model } = snapshot;
  const gust = digest === null ? null : convertWindSpeed(digest.gustMax, windUnit);
  const range =
    digest === null || digest.tempMin === null || digest.tempMax === null
      ? MISSING
      : `${formatTemperature(digest.tempMin)} à ${formatTemperature(digest.tempMax)}`;
  return (
    <>
      <td data-donnee>{formatTemperature(point?.temperature.value ?? null)}</td>
      <td data-donnee>{range}</td>
      <td data-donnee>{formatCompact(digest?.rainMm ?? null)}</td>
      <td data-donnee>{formatInteger(gust)}</td>
      <td className={styles.model}>{model === null ? MISSING : MODEL_LABELS[model]}</td>
    </>
  );
}

interface FavouritesTableProps {
  readonly snapshots: readonly FavouriteSnapshot[];
  readonly activePlaceId: string | null;
  readonly windUnit: Preferences['units']['wind'];
  readonly onOpen: (place: Place) => void;
}

export function FavouritesTable({
  snapshots,
  activePlaceId,
  windUnit,
  onOpen,
}: FavouritesTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction } | null>(null);
  const columns: readonly Column[] = [
    { key: 'name', label: 'Lieu' },
    { key: 'now', label: 'Actuel', unit: '°C' },
    { key: 'range', label: 'Sur 24 h', unit: '°C' },
    { key: 'rain', label: 'Pluie', unit: 'mm' },
    { key: 'gust', label: 'Rafales', unit: windUnitLabel(windUnit) },
  ];

  // Ascendant, descendant, puis retour a l'ordre des favoris.
  const toggle = (key: SortKey) =>
    setSort((current) => {
      if (current?.key !== key) {
        return { key, direction: 'ascending' };
      }
      return current.direction === 'ascending' ? { key, direction: 'descending' } : null;
    });

  const rows = sorted(snapshots, sort?.key ?? null, sort?.direction ?? 'ascending');

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className="visually-hidden">
          Comparaison des lieux favoris sur les 24 prochaines heures, valeurs du modèle retenu pour
          chacun
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={sort?.key === column.key ? sort.direction : undefined}
              >
                <button type="button" className={styles.sort} onClick={() => toggle(column.key)}>
                  {column.label}
                  {column.unit !== undefined && <span className={styles.unit}> {column.unit}</span>}
                </button>
              </th>
            ))}
            <th scope="col">Modèle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((snapshot) => (
            <tr
              key={snapshot.place.id}
              data-active={snapshot.place.id === activePlaceId || undefined}
            >
              <td className={styles.name}>
                <button
                  type="button"
                  className={styles.open}
                  aria-current={snapshot.place.id === activePlaceId ? 'true' : undefined}
                  onClick={() => onOpen(snapshot.place)}
                >
                  {displayName(snapshot.place)}
                </button>
              </td>
              {snapshot.status === 'ready' ? (
                <Cells snapshot={snapshot} windUnit={windUnit} />
              ) : (
                <td colSpan={5} className={styles.muted}>
                  {snapshot.status === 'loading'
                    ? 'prévision en cours de chargement'
                    : 'prévision indisponible'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
