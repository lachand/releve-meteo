import { useState } from 'react';
import type { Place } from '../../domain/types';
import { useGeolocation } from '../hooks/useGeolocation';
import { usePlaceSearch } from '../hooks/usePlaceSearch';
import styles from './PlaceSearch.module.css';

interface PlaceSearchProps {
  readonly onSelect: (place: Place) => void;
}

export function PlaceSearch({ onSelect }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const searchState = usePlaceSearch(query);
  const geolocation = useGeolocation((place) => {
    onSelect(place);
    setQuery('');
  });

  function selectPlace(place: Place): void {
    onSelect(place);
    setQuery('');
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.inputRow}>
        <input
          type="search"
          aria-label="Chercher une commune"
          placeholder="Chercher une commune"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className={styles.locateButton}
          onClick={geolocation.locate}
          disabled={!geolocation.isSupported || geolocation.state.status === 'loading'}
          aria-label="Utiliser ma position"
          title="Utiliser ma position"
        >
          ⌖
        </button>
      </div>

      {searchState.status === 'loading' && <p className={styles.status}>Recherche…</p>}
      {searchState.status === 'empty' && (
        <p className={styles.status}>Aucune commune trouvee pour « {query} ».</p>
      )}
      {searchState.status === 'error' && (
        <p className={styles.status} role="alert">
          La recherche a echoue. Reessayez.
        </p>
      )}
      {geolocation.state.status === 'error' && (
        <p className={styles.status} role="alert">
          {geolocation.state.message}
        </p>
      )}

      {searchState.status === 'ready' && (
        <ul className={styles.results}>
          {searchState.places.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => selectPlace(place)}>
                {place.name}
                {place.admin !== null ? `, ${place.admin}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
