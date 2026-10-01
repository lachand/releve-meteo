import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { LightningFrames } from '../../data/clients/lightning';
import { getLightning } from '../../data/repository';
import type { Place } from '../../domain/types';
import { addPaperBaseLayer, removeMap } from '../mapBase';
import { cssVar } from '../modelPresentation';
import radar from './RadarMap.module.css';
import styles from './LightningMap.module.css';

interface LightningMapProps {
  readonly place: Place;
  readonly now: Date;
}

const DEFAULT_ZOOM = 7;
const LIGHTNING_OPACITY = 0.85;
const FRAME_MS = 500;
const LAST_FRAME_PAUSE_MS = 1800;
const EUMETSAT_ATTRIBUTION = '&copy; <a href="https://www.eumetsat.int/">EUMETSAT</a>';
/** Du jaune pale au rouge sombre : la palette de la legende publiee par la source. */
const LEGEND_GRADIENT = 'linear-gradient(to right, #ffffc9, #fedb7c, #fd943f, #eb2b20, #8c0026)';

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
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
 * Foudre observee : les eclairs accumules sur 5 minutes que voit l'imageur
 * d'eclairs du satellite MTG (EUMETSAT), deux heures en boucle. Une observation,
 * mais optique et vue d'en haut : pas des impacts au sol. App monte ce composant
 * avec `key={place.id}` : changer de lieu recree l'instance.
 */
export function LightningMap({ place, now }: LightningMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlaysRef = useRef<L.ImageOverlay[]>([]);
  const [loaded, setLoaded] = useState<LightningFrames | null>(null);
  const [unavailable, setUnavailable] = useState(false);
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
      removeMap(map);
      mapRef.current = null;
      overlaysRef.current = [];
    };
  }, [place.latitude, place.longitude, place.alias, place.name]);

  useEffect(() => {
    const controller = new AbortController();
    void getLightning(
      { latitude: place.latitude, longitude: place.longitude },
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      const map = mapRef.current;
      if (map === null || !result.ok || result.value.frames.length === 0) {
        setUnavailable(true);
        return;
      }
      const { area, frames } = result.value;
      const bounds = L.latLngBounds([area.south, area.west], [area.north, area.east]);
      // Une image par instant, toutes demandees d'emblee ; seule la courante est visible.
      overlaysRef.current = frames.map((frame) =>
        L.imageOverlay(frame.imageUrl, bounds, {
          attribution: EUMETSAT_ATTRIBUTION,
          opacity: 0,
          crossOrigin: true,
          interactive: false,
          alt: '',
        }).addTo(map),
      );
      // Cadre de la zone couverte : visible meme quand aucun eclair n'est detecte.
      L.rectangle(bounds, {
        color: cssVar('--encre') || '#1c2733',
        weight: 1,
        opacity: 0.7,
        dashArray: '4 4',
        fill: false,
        interactive: false,
      }).addTo(map);
      setIndex(frames.length - 1);
      setLoaded(result.value);
    });
    return () => controller.abort();
  }, [place.latitude, place.longitude]);

  useEffect(() => {
    overlaysRef.current.forEach((overlay, i) =>
      overlay.setOpacity(i === index ? LIGHTNING_OPACITY : 0),
    );
  }, [index, loaded]);

  const frames = loaded?.frames ?? null;
  useEffect(() => {
    if (!playing || frames === null || frames.length < 2) {
      return;
    }
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % frames.length),
      index === frames.length - 1 ? LAST_FRAME_PAUSE_MS : FRAME_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, frames, index]);

  const frame = frames?.[index];
  const latest = frames?.at(-1);
  const label = frame === undefined ? '' : timeFormatter.format(new Date(frame.time));
  const ageMinutes =
    latest === undefined ? null : Math.max(0, Math.round((now.getTime() - latest.time) / 60_000));

  return (
    <div className={radar.wrapper}>
      <div
        ref={containerRef}
        className={radar.map}
        aria-label={`Carte de la foudre observée autour de ${place.name}`}
      />
      {unavailable && <p className={radar.caption}>Foudre observée indisponible pour l’instant.</p>}
      {!unavailable && frames === null && (
        <p className={radar.caption}>Chargement des éclairs observés…</p>
      )}
      {frames !== null && frames.length > 1 && frame !== undefined && (
        <div className={radar.controls}>
          <button
            type="button"
            className={radar.play}
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
            className={radar.slider}
            aria-label="Image des éclairs"
            aria-valuetext={`${label}, observé`}
          />
          <p className={radar.frameLabel} aria-live="polite">
            <span data-donnee>{label}</span> <span className={radar.observed}>observé</span>
          </p>
        </div>
      )}
      {frames !== null && (
        <>
          <p
            className={styles.legend}
            aria-label="Légende des éclairs, par maille de 2 km et 5 minutes"
          >
            <span>1 éclair</span>
            <span className={styles.gradient} style={{ background: LEGEND_GRADIENT }} />
            <span>20 et plus</span>
          </p>
          <p className={radar.caption}>
            Éclairs détectés depuis le satellite MTG (imageur d’éclairs, EUMETSAT), accumulés sur 5
            minutes par maille de 2 km
            {ageMinutes === null || latest === undefined
              ? ''
              : ` ; dernière image de ${timeFormatter.format(new Date(latest.time))}, il y a ${ageMinutes} min`}
            . Le satellite voit la lumière des éclairs, dans les nuages comme vers le sol : ce ne
            sont pas des impacts localisés au sol. Une zone sans couleur veut dire qu’aucun éclair
            n’a été détecté, ou qu’aucune image n’a été publiée à cet instant. Données ouvertes,
            produit pouvant évoluer.
          </p>
        </>
      )}
    </div>
  );
}
