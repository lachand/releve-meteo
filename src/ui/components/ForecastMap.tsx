import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cellBounds, lastCoveredIndex, valueRange } from '../../domain/grid';
import type { ForecastGrid } from '../../domain/grid';
import { MODEL_SPECS } from '../../domain/models';
import { hoursBetween, localIsoFromUtc } from '../../domain/time';
import type { LocalIsoHour, ModelId, Place } from '../../domain/types';
import { formatCompact, formatDayHour, formatTemperature } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { addPaperBaseLayer } from '../mapBase';
import {
  RAIN_COLORS,
  RAIN_THRESHOLDS,
  TEMPERATURE_GRADIENT,
  rainColor,
  temperatureColor,
} from '../mapScales';
import { MODEL_LABELS, cssVar } from '../modelPresentation';
import styles from './ForecastMap.module.css';

type MapLayer = 'pluie' | 'temperature';

const CELL_OPACITY = 0.62;
const FRAME_MS = 900;
/** Sous cette largeur de case a l'ecran, une etiquette sur deux. */
const DENSE_LABEL_PX = 34;
/** En deca, la pluie ne colore pas la case et n'est pas etiquetee. */
const RAIN_MIN_MM = RAIN_THRESHOLDS[0];

interface Cell {
  readonly rect: L.Rectangle;
  readonly label: L.Marker;
}

interface ForecastMapProps {
  readonly place: Place;
  readonly model: ModelId;
  readonly state: DatasetState<ForecastGrid>;
  readonly now: Date;
}

function currentHourIso(now: Date): LocalIsoHour {
  return `${localIsoFromUtc(now.getTime()).slice(0, 13)}:00`;
}

function relativeHours(from: LocalIsoHour, to: LocalIsoHour): string {
  const hours = Math.round(hoursBetween(from, to));
  if (hours <= 0) {
    return 'heure en cours';
  }
  return `dans ${hours} h`;
}

/** Resume textuel de l'image affichee : la carte ne doit pas etre le seul support. */
function frameSummary(grid: ForecastGrid, index: number, layer: MapLayer): string {
  const total = grid.points.length;
  if (layer === 'pluie') {
    const values = (grid.precipitation[index] ?? []).filter((v): v is number => v !== null);
    const wet = values.filter((v) => v >= RAIN_MIN_MM);
    if (values.length === 0) {
      return 'Pluie non fournie par le modèle à cette heure.';
    }
    if (wet.length === 0) {
      return `Aucune pluie prévue sur les ${total} cases.`;
    }
    return `Pluie prévue sur ${wet.length} cases sur ${total}, jusqu’à ${formatCompact(Math.max(...wet))} mm en une heure.`;
  }
  const range = valueRange([grid.temperature[index] ?? []]);
  if (range === null) {
    return 'Température non fournie par le modèle à cette heure.';
  }
  return `De ${formatTemperature(range.min)} à ${formatTemperature(range.max)} °C sur la zone.`;
}

/**
 * Carte de prevision : une case par point de grille, coloree par la pluie
 * de l'heure ou par la temperature, avec la valeur ecrite en son centre.
 * App monte ce composant avec `key={place.id}` : changer de lieu recree
 * l'instance.
 */
export function ForecastMap({ place, model, state, now }: ForecastMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const cellsRef = useRef<Cell[]>([]);
  const [dense, setDense] = useState(false);
  const [chosenLayer, setChosenLayer] = useState<MapLayer | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const grid = state.status === 'ready' ? state.value : null;
  const nowHour = currentHourIso(now);
  const covered = grid === null ? -1 : lastCoveredIndex(grid);
  const startIndex = useMemo(() => {
    if (grid === null) {
      return 0;
    }
    const first = grid.times.findIndex((time) => time >= nowHour);
    return first === -1 ? 0 : first;
  }, [grid, nowHour]);
  const index = Math.min(Math.max(chosenIndex ?? startIndex, startIndex), Math.max(covered, 0));

  const temperatureRange = useMemo(
    () => (grid === null ? null : valueRange(grid.temperature.slice(startIndex, covered + 1))),
    [grid, startIndex, covered],
  );
  const hasRain = useMemo(
    () =>
      grid !== null &&
      grid.precipitation
        .slice(startIndex, covered + 1)
        .some((row) => row.some((value) => value !== null && value >= RAIN_MIN_MM)),
    [grid, startIndex, covered],
  );
  // Par defaut, la pluie s'il en tombe dans les 48 h ; sinon la temperature.
  const layer: MapLayer = chosenLayer ?? (hasRain ? 'pluie' : 'temperature');

  // Carte et fond.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    // Sans fondu des tuiles : aucune animation decorative (DESIGN.md).
    const map = L.map(container, { fadeAnimation: false }).setView(
      [place.latitude, place.longitude],
      9,
    );
    addPaperBaseLayer(map);
    const ink = cssVar('--encre') || '#1c2733';
    L.circleMarker([place.latitude, place.longitude], {
      radius: 5,
      color: ink,
      weight: 2,
      fillColor: ink,
      fillOpacity: 0.9,
      pane: 'markerPane',
    })
      .bindTooltip(place.alias ?? place.name)
      .addTo(map);
    // Largeur d'une case a l'ecran : sous DENSE_LABEL_PX, une etiquette sur deux.
    const updateDensity = () => {
      const firstCell = cellsRef.current[0];
      const span = map.getBounds().getEast() - map.getBounds().getWest();
      if (firstCell === undefined || span <= 0) {
        return;
      }
      const cell = firstCell.rect.getBounds();
      setDense(((cell.getEast() - cell.getWest()) / span) * map.getSize().x < DENSE_LABEL_PX);
    };
    map.on('zoomend', updateDensity);
    mapRef.current = map;
    return () => {
      map.off('zoomend', updateDensity);
      map.remove();
      mapRef.current = null;
      cellsRef.current = [];
    };
  }, [place.latitude, place.longitude, place.alias, place.name]);

  // Cases de la grille, creees une fois par grille.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || grid === null) {
      return;
    }
    const cells = grid.points.map((point): Cell => {
      const bounds = cellBounds(point, grid.stepKm);
      const rect = L.rectangle(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { stroke: false, fillOpacity: 0, interactive: false },
      ).addTo(map);
      const label = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({ className: styles.cellLabel ?? '', html: '', iconSize: [40, 16] }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      return { rect, label };
    });
    cellsRef.current = cells;
    const first = cells[0]?.rect.getBounds();
    const last = cells.at(-1)?.rect.getBounds();
    let frame: L.Rectangle | null = null;
    if (first !== undefined && last !== undefined) {
      const extent = L.latLngBounds(first.getNorthWest(), last.getSouthEast());
      // Cadre de la zone calculee : visible meme quand aucune case n'est coloree.
      frame = L.rectangle(extent, {
        color: cssVar('--encre') || '#1c2733',
        weight: 1,
        opacity: 0.7,
        dashArray: '4 4',
        fill: false,
        interactive: false,
      }).addTo(map);
      // Taille relue avant le cadrage : le conteneur a pu changer depuis la creation.
      map.invalidateSize();
      map.fitBounds(extent, { padding: [8, 8] });
    }
    // Densite des etiquettes, meme si le cadrage n'a pas change le zoom.
    map.fire('zoomend');
    return () => {
      cells.forEach((cell) => {
        cell.rect.remove();
        cell.label.remove();
      });
      frame?.remove();
      cellsRef.current = [];
    };
  }, [grid]);

  // Image courante : couleur et valeur de chaque case.
  useEffect(() => {
    if (grid === null) {
      return;
    }
    const ink = cssVar('--encre') || '#1c2733';
    const values = (layer === 'pluie' ? grid.precipitation : grid.temperature)[index] ?? [];
    cellsRef.current.forEach((cell, i) => {
      const point = grid.points[i];
      const value = values[i] ?? null;
      if (value === null) {
        // Valeur absente : contour pointille, jamais une case peinte a zero.
        cell.rect.setStyle({
          stroke: true,
          color: ink,
          weight: 1,
          opacity: 0.45,
          dashArray: '2 4',
          fillOpacity: 0,
        });
      } else {
        const fill =
          layer === 'pluie'
            ? rainColor(value)
            : temperatureColor(value, temperatureRange ?? { min: value, max: value });
        cell.rect.setStyle({
          stroke: false,
          fillColor: fill ?? ink,
          fillOpacity: fill === null ? 0 : CELL_OPACITY,
        });
      }
      // Une etiquette sur deux quand les cases sont petites ; jamais sous le
      // marqueur du lieu, au centre de la grille.
      const half = Math.floor(Math.sqrt(grid.points.length) / 2);
      const hidden =
        point === undefined ||
        (point.row === half && point.col === half) ||
        (dense && (point.row + point.col) % 2 === 1);
      const text =
        value === null || hidden
          ? ''
          : layer === 'pluie'
            ? value >= RAIN_MIN_MM
              ? formatCompact(value)
              : ''
            : formatTemperature(value);
      const element = cell.label.getElement();
      if (element !== undefined) {
        element.textContent = text;
      }
    });
  }, [grid, index, layer, temperatureRange, dense]);

  // Lecture.
  useEffect(() => {
    if (!playing || grid === null || covered <= startIndex) {
      return;
    }
    const timer = window.setTimeout(
      () => setChosenIndex(index >= covered ? startIndex : index + 1),
      FRAME_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, grid, index, covered, startIndex]);

  const time = grid?.times[index];
  const modelLabel = MODEL_LABELS[model];
  const coverageEnd = grid === null || covered < 0 ? undefined : grid.times[covered];

  return (
    <div className={styles.wrapper}>
      {grid !== null && covered >= 0 && (
        <div className={styles.toolbar}>
          <div className={styles.layers} role="group" aria-label="Grandeur affichée">
            <button
              type="button"
              aria-pressed={layer === 'pluie'}
              onClick={() => setChosenLayer('pluie')}
            >
              Pluie
            </button>
            <button
              type="button"
              aria-pressed={layer === 'temperature'}
              onClick={() => setChosenLayer('temperature')}
            >
              Température
            </button>
          </div>
          {time !== undefined && (
            <p className={styles.frameLabel} aria-live="polite">
              <span data-donnee>{formatDayHour(time)}</span>{' '}
              <span className={styles.relative}>({relativeHours(nowHour, time)})</span>{' '}
              <span className={styles.forecast}>prévu</span>
            </p>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className={styles.map}
        aria-label={`Carte de prévision ${modelLabel} autour de ${place.name}`}
      />

      {state.status === 'loading' && (
        <p className={styles.caption}>Chargement de la carte de prévision…</p>
      )}
      {state.status === 'error' && (
        <p className={styles.caption}>Carte de prévision indisponible pour l’instant.</p>
      )}
      {grid !== null && covered < 0 && (
        <p className={styles.caption}>
          {modelLabel} ne fournit aucune valeur pour cette zone en ce moment.
        </p>
      )}

      {grid !== null && covered >= 0 && time !== undefined && (
        <>
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
              min={startIndex}
              max={covered}
              value={index}
              onChange={(event) => {
                setPlaying(false);
                setChosenIndex(Number(event.target.value));
              }}
              className={styles.slider}
              aria-label="Échéance de la carte"
              aria-valuetext={`${formatDayHour(time)}, ${relativeHours(nowHour, time)}`}
            />
          </div>

          <p className={styles.summary}>{frameSummary(grid, index, layer)}</p>

          {layer === 'pluie' ? (
            <ul className={styles.legend} aria-label="Légende de la pluie, mm en une heure">
              {RAIN_COLORS.map((color, i) => (
                <li key={color}>
                  <span className={styles.swatch} style={{ background: color }} />
                  {i === 0 ? 'dès ' : ''}
                  {formatCompact(RAIN_THRESHOLDS[i] ?? null)}
                  {i === RAIN_COLORS.length - 1 ? ' mm/h et plus' : ''}
                </li>
              ))}
            </ul>
          ) : (
            temperatureRange !== null && (
              <div className={styles.gradientLegend}>
                <span data-donnee>{formatTemperature(temperatureRange.min)} °C</span>
                <span className={styles.gradient} style={{ background: TEMPERATURE_GRADIENT }} />
                <span data-donnee>{formatTemperature(temperatureRange.max)} °C</span>
              </div>
            )
          )}

          <p className={styles.caption}>
            Prévu par {modelLabel} (maille {formatCompact(MODEL_SPECS[model].resolutionKm)} km), une
            case tous les {formatCompact(grid.stepKm)} km : la valeur calculée au centre de chaque
            case, sans lissage. Échelle des températures propre à la carte, sur toute la période.
            {coverageEnd !== undefined && covered < grid.times.length - 1 && (
              <>
                {' '}
                Au-delà de {formatDayHour(coverageEnd)}, {modelLabel} ne couvre plus cette zone.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
