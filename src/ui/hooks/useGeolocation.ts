import { useState } from 'react';
import type { Place } from '../../domain/types';

export type GeolocationState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string };

function placeFromPosition(position: GeolocationPosition): Place {
  const { latitude, longitude, altitude } = position.coords;
  return {
    id: `${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    name: 'Ma position',
    latitude,
    longitude,
    elevation: altitude ?? 0,
    admin: null,
    alias: null,
  };
}

/** Geolocalisation navigateur, en amelioration progressive : masquee si indisponible. */
export function useGeolocation(onLocated: (place: Place) => void): {
  readonly state: GeolocationState;
  readonly isSupported: boolean;
  readonly locate: () => void;
} {
  const [state, setState] = useState<GeolocationState>({ status: 'idle' });
  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  function locate(): void {
    if (!isSupported) {
      setState({
        status: 'error',
        message: "La geolocalisation n'est pas disponible sur cet appareil.",
      });
      return;
    }
    setState({ status: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({ status: 'idle' });
        onLocated(placeFromPosition(position));
      },
      () => {
        setState({
          status: 'error',
          message: 'Position indisponible. Verifiez les autorisations du navigateur.',
        });
      },
    );
  }

  return { state, isSupported, locate };
}
