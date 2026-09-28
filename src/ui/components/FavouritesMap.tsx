import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Place } from '../../domain/types';
import { formatTemperature } from '../format';
import type { FavouriteSnapshot } from '../hooks/useFavouriteSnapshots';
import { addPaperBaseLayer } from '../mapBase';
import { ANCHOR_PX, COMPACT_MAP_WIDTH_PX, plotSides, plotWidth } from '../plotLayout';
import { MODEL_LABELS } from '../modelPresentation';
import { WeatherSymbol } from '../symbols/WeatherSymbol';
import { weatherCodeLabel } from '../weatherCodePresentation';
import styles from './FavouritesMap.module.css';

/*
 * Carte « Mes lieux » : chaque favori pose comme sur une carte
 * d'observation, symbole synoptique a l'emplacement, temperature a cote,
 * et le nom du modele qui la donne (jamais une valeur sans sa source).
 * Une liste reprend les memes lieux, pour le clavier et les lecteurs
 * d'ecran, et quand la carte est trop petite.
 */

const SINGLE_PLACE_ZOOM = 8;
interface FavouritesMapProps {
  readonly snapshots: readonly FavouriteSnapshot[];
  readonly activePlaceId: string | null;
  readonly onOpen: (place: Place) => void;
}

function displayName(place: Place): string {
  return place.alias ?? place.name;
}

/** Phrase complete d'un favori : ce que lit un lecteur d'ecran. */
function describe(snapshot: FavouriteSnapshot): string {
  const name = displayName(snapshot.place);
  if (snapshot.status === 'loading') {
    return `${name} : prévision en cours de chargement`;
  }
  if (snapshot.status === 'error' || snapshot.point === null || snapshot.model === null) {
    return `${name} : prévision indisponible`;
  }
  const condition = weatherCodeLabel(snapshot.point.weatherCode);
  const temperature = snapshot.point.temperature.value;
  return [
    `${name} : ${temperature === null ? 'température non fournie' : `${formatTemperature(temperature)} °C`}`,
    condition?.toLowerCase(),
    `selon ${MODEL_LABELS[snapshot.model]}${snapshot.manual ? ', choisi manuellement' : ''}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(', ');
}

function Plot({
  snapshot,
  active,
  onOpen,
}: {
  readonly snapshot: FavouriteSnapshot;
  readonly active: boolean;
  readonly onOpen: (place: Place) => void;
}) {
  const ready = snapshot.status === 'ready' ? snapshot : null;
  const point = ready?.point ?? null;
  return (
    <button
      type="button"
      className={styles.plot}
      data-active={active || undefined}
      aria-label={`${describe(snapshot)}. Ouvrir le relevé.`}
      onClick={() => onOpen(snapshot.place)}
    >
      <span className={styles.plotSymbol} aria-hidden="true">
        {point === null ? (
          <span className={styles.stationCircle} />
        ) : (
          <WeatherSymbol
            code={point.weatherCode}
            cloudCover={point.cloudCover.value}
            size={26}
            decorative
          />
        )}
      </span>
      <span className={styles.plotTemp} data-donnee aria-hidden="true">
        {snapshot.status === 'loading'
          ? '…'
          : `${formatTemperature(point?.temperature.value ?? null)}°`}
      </span>
      <span className={styles.plotName} aria-hidden="true">
        {displayName(snapshot.place)}
        {ready?.model != null && ` · ${MODEL_LABELS[ready.model]}`}
      </span>
    </button>
  );
}

export function FavouritesMap({ snapshots, activePlaceId, onOpen }: FavouritesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [targets, setTargets] = useState<ReadonlyMap<string, HTMLElement>>(new Map());

  // Les marqueurs ne dependent que de la liste des lieux, pas des valeurs :
  // les etiquettes se mettent a jour par portail, sans recreer la carte.
  const places = useMemo(() => snapshots.map((snapshot) => snapshot.place), [snapshots]);
  const placesKey = places
    .map((place) => `${place.id}:${place.latitude}:${place.longitude}`)
    .join('|');

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    // Zoom au quart de niveau : la carte cadre les favoris au plus serre,
    // ce qui ecarte les etiquettes de lieux proches.
    const map = L.map(container, { fadeAnimation: false, zoomSnap: 0.25 }).setView([46.6, 2.4], 5);
    addPaperBaseLayer(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map === null || places.length === 0) {
      return;
    }
    const markers = places.map((place) => {
      const marker = L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({
          className: styles.plotIcon ?? '',
          html: '',
          iconSize: [150, 48],
          // Le symbole (le cercle de station) est pose sur le lieu.
          iconAnchor: [16, 16],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      const element = marker.getElement();
      if (element !== undefined) {
        // Le bouton de l'etiquette ne doit ni deplacer ni zoomer la carte.
        L.DomEvent.disableClickPropagation(element);
      }
      return { id: place.id, marker, element };
    });
    setTargets(
      new Map(
        markers.flatMap(({ id, element }) =>
          element === undefined ? [] : [[id, element] as const],
        ),
      ),
    );
    // Etiquettes qui se chevaucheraient : la suivante passe a gauche.
    const layout = () => {
      const compact = map.getSize().x < COMPACT_MAP_WIDTH_PX;
      map.getContainer().dataset.compact = compact ? 'true' : 'false';
      const sides = plotSides(
        markers.map(({ id, marker }) => {
          const point = map.latLngToContainerPoint(marker.getLatLng());
          const place = places.find((candidate) => candidate.id === id);
          return {
            id,
            x: point.x,
            y: point.y,
            w: place === undefined ? 96 : plotWidth(place, compact),
          };
        }),
        map.getSize().x,
      );
      for (const { id, element } of markers) {
        if (element !== undefined) {
          element.dataset.side = sides.get(id) ?? 'right';
        }
      }
    };
    map.on('zoomend', layout);
    const first = places[0];
    if (places.length === 1 && first !== undefined) {
      map.setView([first.latitude, first.longitude], SINGLE_PLACE_ZOOM);
    } else {
      map.invalidateSize();
      // Les etiquettes partent vers la droite du lieu : le cadrage leur
      // reserve cette place a droite, sans depasser un tiers de la carte.
      const size = map.getSize();
      const compact = size.x < COMPACT_MAP_WIDTH_PX;
      const widest = Math.max(...places.map((place) => plotWidth(place, compact)));
      map.fitBounds(L.latLngBounds(places.map((place) => [place.latitude, place.longitude])), {
        paddingTopLeft: [24, 24],
        paddingBottomRight: [Math.min(widest - ANCHOR_PX + 8, size.x / 3), 40],
        maxZoom: 9,
      });
    }
    layout();
    return () => {
      map.off('zoomend', layout);
      markers.forEach(({ marker }) => marker.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `placesKey` resume `places` : seuls les lieux et leurs coordonnees recreent les marqueurs.
  }, [placesKey]);

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={styles.map}
        aria-label="Carte des lieux favoris"
        role="region"
      />
      {snapshots.map((snapshot) => {
        const target = targets.get(snapshot.place.id);
        return target === undefined
          ? null
          : createPortal(
              <Plot
                snapshot={snapshot}
                active={snapshot.place.id === activePlaceId}
                onOpen={onOpen}
              />,
              target,
              snapshot.place.id,
            );
      })}

      <ul className={styles.list} aria-label="Mes lieux, valeurs du moment">
        {snapshots.map((snapshot) => (
          <li key={snapshot.place.id}>
            <button
              type="button"
              className={styles.item}
              data-active={snapshot.place.id === activePlaceId || undefined}
              onClick={() => onOpen(snapshot.place)}
            >
              <span className={styles.itemName}>{displayName(snapshot.place)}</span>
              <span className={styles.itemValue}>{describe(snapshot).split(' : ')[1]}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.caption}>
        Valeur du moment selon le modèle que retiendrait la page de chaque lieu (terrain, choix
        manuel, fiabilité mesurée déjà connue). Toucher un lieu ouvre son relevé.
      </p>
    </div>
  );
}
