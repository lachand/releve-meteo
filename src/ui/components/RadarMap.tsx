import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { fetchLatestRadarFrame } from '../../data/clients/rainviewer';
import type { Place } from '../../domain/types';
import styles from './RadarMap.module.css';

interface RadarMapProps {
  readonly place: Place;
}

const DEFAULT_ZOOM = 8;
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const RAINVIEWER_ATTRIBUTION = '<a href="https://www.rainviewer.com/">RainViewer</a>';
const RADAR_OPACITY = 0.7;

const frameTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Fond de carte OpenStreetMap et overlay radar RainViewer (BACKLOG.md
 * Lot 6). App.tsx doit monter ce composant avec `key={place.id}` : changer
 * de lieu recree l'instance plutot que de reinitialiser l'etat a la main
 * dans un effet (evite le cascading render que `react-hooks/set-state-in-effect` signale).
 */
export function RadarMap({ place }: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const [radarUnavailable, setRadarUnavailable] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const map = L.map(container).setView([place.latitude, place.longitude], DEFAULT_ZOOM);
    // crossOrigin : OSM et RainViewer envoient tous deux
    // Access-Control-Allow-Origin: *, verifie en direct. Sans cette option,
    // Leaflet charge les tuiles via <img> en mode no-cors, ce qui remonte
    // des reponses opaques (status 0) que le service worker ne peut pas
    // mettre en cache avec un horodatage d'expiration (sw.ts, piege 1).
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      radarLayerRef.current = null;
    };
  }, [place.latitude, place.longitude]);

  useEffect(() => {
    let cancelled = false;

    void fetchLatestRadarFrame().then((result) => {
      if (cancelled) {
        return;
      }
      const map = mapRef.current;
      if (map === null || !result.ok || result.value === null) {
        setRadarUnavailable(true);
        return;
      }
      radarLayerRef.current?.remove();
      radarLayerRef.current = L.tileLayer(result.value.tileUrlTemplate, {
        attribution: RAINVIEWER_ATTRIBUTION,
        opacity: RADAR_OPACITY,
        crossOrigin: true,
      }).addTo(map);
      setFrameTime(result.value.time);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={styles.map}
        aria-label={`Carte radar autour de ${place.name}`}
      />
      <p className={styles.caption}>
        {radarUnavailable
          ? "Overlay radar indisponible pour l'instant."
          : frameTime === null
            ? 'Chargement du radar…'
            : `Radar : ${frameTimeFormatter.format(new Date(frameTime * 1000))}`}
      </p>
    </div>
  );
}
