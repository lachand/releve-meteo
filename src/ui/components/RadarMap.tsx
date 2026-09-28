import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { fetchRadarFrames } from '../../data/clients/rainviewer';
import type { RadarAnimationFrame } from '../../data/clients/rainviewer';
import type { Place } from '../../domain/types';
import { addPaperBaseLayer } from '../mapBase';
import { cssVar } from '../modelPresentation';
import styles from './RadarMap.module.css';

interface RadarMapProps {
  readonly place: Place;
}

const DEFAULT_ZOOM = 8;
const RAINVIEWER_ATTRIBUTION = '<a href="https://www.rainviewer.com/">RainViewer</a>';
const RADAR_OPACITY = 0.7;
/** Duree d'affichage d'une trame en lecture, ms ; la derniere observee dure plus. */
const FRAME_MS = 700;
const LAST_OBSERVED_PAUSE_MS = 1800;

const frameTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Fond OpenStreetMap et boucle radar RainViewer : deux heures observees
 * (pas de 10 min) puis le nowcast, marque « prévu ». Lecture automatique
 * sauf si l'utilisateur demande de reduire les animations ; curseur et
 * bouton de lecture pour parcourir les trames. App monte ce composant avec
 * `key={place.id}` : changer de lieu recree l'instance.
 */
export function RadarMap({ place }: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.TileLayer[]>([]);
  const [frames, setFrames] = useState<readonly RadarAnimationFrame[] | null>(null);
  const [radarUnavailable, setRadarUnavailable] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    // Sans fondu des tuiles : aucune animation decorative (DESIGN.md).
    const map = L.map(container, { fadeAnimation: false }).setView(
      [place.latitude, place.longitude],
      DEFAULT_ZOOM,
    );
    addPaperBaseLayer(map);
    const ink = cssVar('--encre') || '#1c2733';
    L.circleMarker([place.latitude, place.longitude], {
      radius: 6,
      color: ink,
      weight: 2,
      fillColor: ink,
      fillOpacity: 0.9,
    })
      .bindTooltip(place.alias ?? place.name)
      .addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = [];
    };
  }, [place.latitude, place.longitude, place.alias, place.name]);

  useEffect(() => {
    let cancelled = false;
    void fetchRadarFrames().then((result) => {
      if (cancelled) {
        return;
      }
      const map = mapRef.current;
      if (map === null || !result.ok || result.value.length === 0) {
        setRadarUnavailable(true);
        return;
      }
      // Une couche par trame, toutes chargees d'emblee (tuiles mises en
      // cache par le service worker) ; seule la trame courante est visible.
      layersRef.current = result.value.map((frame) =>
        L.tileLayer(frame.tileUrlTemplate, {
          attribution: RAINVIEWER_ATTRIBUTION,
          opacity: 0,
          crossOrigin: true,
        }).addTo(map),
      );
      // Demarre sur la derniere trame observee : l'etat present.
      let lastObserved = 0;
      result.value.forEach((f, i) => {
        if (f.provenance === 'observed') {
          lastObserved = i;
        }
      });
      setIndex(lastObserved);
      setFrames(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Trame visible.
  useEffect(() => {
    layersRef.current.forEach((layer, i) => layer.setOpacity(i === index ? RADAR_OPACITY : 0));
  }, [index, frames]);

  // Lecture en boucle.
  useEffect(() => {
    if (!playing || frames === null || frames.length < 2) {
      return;
    }
    const isLastObserved =
      frames[index]?.provenance === 'observed' && frames[index + 1]?.provenance !== 'observed';
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % frames.length),
      isLastObserved ? LAST_OBSERVED_PAUSE_MS : FRAME_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, frames, index]);

  const frame = frames?.[index];

  return (
    <div className={styles.wrapper}>
      <div
        ref={containerRef}
        className={styles.map}
        aria-label={`Carte radar autour de ${place.name}`}
      />
      {radarUnavailable && <p className={styles.caption}>Radar indisponible pour l’instant.</p>}
      {!radarUnavailable && frames === null && (
        <p className={styles.caption}>Chargement du radar…</p>
      )}
      {frames !== null && frames.length === 1 && frame !== undefined && (
        <p className={styles.caption}>
          Radar : {frameTimeFormatter.format(new Date(frame.time * 1000))}
        </p>
      )}
      {frames !== null && frames.length > 1 && frame !== undefined && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.play}
            onClick={() => setPlaying((value) => !value)}
            aria-pressed={playing}
          >
            {playing ? 'Pause' : 'Lecture'}
          </button>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={index}
            onChange={(event) => {
              setPlaying(false);
              setIndex(Number(event.target.value));
            }}
            className={styles.slider}
            aria-label="Trame radar"
            aria-valuetext={`${frameTimeFormatter.format(new Date(frame.time * 1000))}, ${frame.provenance === 'observed' ? 'observé' : 'prévu'}`}
          />
          <p className={styles.frameLabel} aria-live="polite">
            <span data-donnee>{frameTimeFormatter.format(new Date(frame.time * 1000))}</span>{' '}
            <span className={frame.provenance === 'observed' ? styles.observed : styles.forecast}>
              {frame.provenance === 'observed' ? 'observé' : 'prévu'}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
