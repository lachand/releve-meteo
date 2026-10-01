import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cellBounds, lastCoveredIndex, thunderCells, valueRange } from '../../domain/grid';
import type { ForecastGrid } from '../../domain/grid';
import { MODEL_SPECS } from '../../domain/models';
import { PHENOMENON_THRESHOLDS } from '../../domain/phenomena';
import type { RiskLevel } from '../../domain/phenomena';
import { hoursBetween, localIsoFromUtc } from '../../domain/time';
import type { LocalIsoHour, ModelId, Place } from '../../domain/types';
import { formatCompact, formatDayHour, formatTemperature } from '../format';
import type { DatasetState } from '../hooks/useDataset';
import { addPaperBaseLayer, removeMap } from '../mapBase';
import {
  RAIN_COLORS,
  RAIN_THRESHOLDS,
  SPREAD_COLORS,
  SPREAD_THRESHOLDS,
  TEMPERATURE_GRADIENT,
  THUNDER_COLORS,
  rainColor,
  spreadColor,
  temperatureColor,
  thunderColor,
} from '../mapScales';
import { MODEL_LABELS, cssVar } from '../modelPresentation';
import styles from './ForecastMap.module.css';

type MapLayer = 'pluie' | 'temperature' | 'orage';

const THUNDER_LABELS: Readonly<Record<RiskLevel, string>> = {
  low: 'Orage possible',
  moderate: 'Orage probable',
  high: 'Orage fort',
};
const LEVEL_ORDER: readonly RiskLevel[] = ['low', 'moderate', 'high'];

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
  /**
   * Carte du desaccord : la grille porte des ecarts entre ces modeles, pas des
   * valeurs. Couleurs et textes changent ; la mecanique reste celle de la carte.
   */
  readonly spread?: { readonly models: readonly ModelId[] };
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
function frameSummary(
  grid: ForecastGrid,
  index: number,
  layer: MapLayer,
  isSpread: boolean,
): string {
  const total = grid.points.length;
  if (isSpread) {
    const values = (layer === 'pluie' ? grid.precipitation : grid.temperature)[index] ?? [];
    const known = values.filter((v): v is number => v !== null);
    if (known.length === 0) {
      return 'Écart non calculable à cette heure : moins de deux modèles fournissent une valeur.';
    }
    const unit = layer === 'pluie' ? 'mm en une heure' : '°C';
    return `Écart maximal entre les modèles sur la zone : ${formatCompact(Math.round(Math.max(...known) * 10) / 10)} ${unit}.`;
  }
  if (layer === 'orage') {
    const cells = thunderCells(grid, index);
    if (cells.every((cell) => cell === null)) {
      return 'Orage non fourni par le modèle à cette heure (ni CAPE ni code météo).';
    }
    const stormy = cells.flatMap((cell) => (cell === null || cell.risk === null ? [] : [cell]));
    if (stormy.length === 0) {
      return `Aucun orage prévu sur les ${total} cases.`;
    }
    const worst = Math.max(...stormy.map((cell) => LEVEL_ORDER.indexOf(cell.risk?.level ?? 'low')));
    const capes = stormy.flatMap((cell) => (cell.cape === null ? [] : [cell.cape]));
    const capeText =
      capes.length === 0
        ? ''
        : `, CAPE jusqu’à ${formatCompact(Math.round(Math.max(...capes)))} J/kg`;
    const label = THUNDER_LABELS[LEVEL_ORDER[worst] ?? 'low'].toLowerCase();
    return `Orage prévu sur ${stormy.length} ${stormy.length > 1 ? 'cases' : 'case'} sur ${total}, niveau le plus élevé : ${label}${capeText}.`;
  }
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
export function ForecastMap({ place, model, state, now, spread }: ForecastMapProps) {
  const isSpread = spread !== undefined;
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
      removeMap(map);
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
    const storms = layer === 'orage' ? thunderCells(grid, index) : [];
    cellsRef.current.forEach((cell, i) => {
      const point = grid.points[i];
      const storm = storms[i] ?? null;
      const value = values[i] ?? null;
      if (layer === 'orage' ? storm === null : value === null) {
        // Valeur absente : contour pointille, jamais une case peinte a zero.
        cell.rect.setStyle({
          stroke: true,
          color: ink,
          weight: 1,
          opacity: 0.45,
          dashArray: '2 4',
          fillOpacity: 0,
        });
      } else if (layer === 'orage') {
        const fill = thunderColor(storm?.risk?.level ?? null);
        cell.rect.setStyle({
          stroke: false,
          fillColor: fill ?? ink,
          fillOpacity: fill === null ? 0 : CELL_OPACITY,
        });
      } else if (value !== null) {
        const fill = isSpread
          ? spreadColor(value, layer === 'pluie' ? 'rain' : 'temperature')
          : layer === 'pluie'
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
      const spreadFirst = SPREAD_THRESHOLDS[layer === 'pluie' ? 'rain' : 'temperature'][0];
      const text =
        hidden || (layer === 'orage' ? storm === null : value === null)
          ? ''
          : layer === 'orage'
            ? storm?.risk == null
              ? ''
              : storm.cape === null
                ? 'orage'
                : formatCompact(Math.round(storm.cape))
            : value === null
              ? ''
              : isSpread
                ? value >= spreadFirst
                  ? formatCompact(Math.round(value * 10) / 10)
                  : ''
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
  }, [grid, index, layer, temperatureRange, dense, isSpread]);

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
              {isSpread ? 'Écart de pluie' : 'Pluie'}
            </button>
            <button
              type="button"
              aria-pressed={layer === 'temperature'}
              onClick={() => setChosenLayer('temperature')}
            >
              {isSpread ? 'Écart de température' : 'Température'}
            </button>
            {!isSpread && (
              <button
                type="button"
                aria-pressed={layer === 'orage'}
                onClick={() => setChosenLayer('orage')}
              >
                Orage
              </button>
            )}
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
        aria-label={
          isSpread
            ? `Carte du désaccord entre modèles autour de ${place.name}`
            : `Carte de prévision ${modelLabel} autour de ${place.name}`
        }
      />

      {state.status === 'loading' && (
        <p className={styles.caption}>
          {isSpread
            ? 'Chargement des grilles de quatre modèles…'
            : 'Chargement de la carte de prévision…'}
        </p>
      )}
      {state.status === 'error' && (
        <p className={styles.caption}>
          {isSpread
            ? 'Carte du désaccord indisponible pour l’instant.'
            : 'Carte de prévision indisponible pour l’instant.'}
        </p>
      )}
      {grid !== null && covered < 0 && (
        <p className={styles.caption}>
          {isSpread
            ? 'Aucun écart calculable pour cette zone en ce moment.'
            : `${modelLabel} ne fournit aucune valeur pour cette zone en ce moment.`}
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

          <p className={styles.summary}>{frameSummary(grid, index, layer, isSpread)}</p>

          {isSpread ? (
            <ul
              className={styles.legend}
              aria-label={`Légende de l’écart entre modèles, ${layer === 'pluie' ? 'mm en une heure' : '°C'}`}
            >
              {SPREAD_COLORS.map((color, i) => (
                <li key={color}>
                  <span className={styles.swatch} style={{ background: color }} />
                  {i === 0 ? 'dès ' : ''}
                  {formatCompact(
                    SPREAD_THRESHOLDS[layer === 'pluie' ? 'rain' : 'temperature'][i] ?? null,
                  )}
                  {i === SPREAD_COLORS.length - 1 ? ' et plus' : ''}
                </li>
              ))}
            </ul>
          ) : layer === 'orage' ? (
            <ul className={styles.legend} aria-label="Légende du potentiel d’orage">
              {LEVEL_ORDER.map((level) => (
                <li key={level}>
                  <span className={styles.swatch} style={{ background: THUNDER_COLORS[level] }} />
                  {THUNDER_LABELS[level]}
                </li>
              ))}
            </ul>
          ) : layer === 'pluie' ? (
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
            {spread !== undefined ? (
              <>
                Écart entre le modèle le plus haut et le plus bas à chaque case, parmi{' '}
                {spread.models.map((m) => MODEL_LABELS[m]).join(', ')} : une case sans couleur est
                une case où les modèles s’accordent ; une case pointillée, où moins de deux modèles
                fournissent une valeur. Un grand écart dit où la prévision est incertaine, pas qui a
                raison. Une case tous les {formatCompact(grid.stepKm)} km, sans lissage.
              </>
            ) : layer === 'orage' ? (
              <>
                Potentiel d’orage prévu par {modelLabel} : un orage est retenu quand le modèle le
                code lui-même, ou que la CAPE (énergie d’instabilité, J/kg, écrite dans la case)
                atteint {formatCompact(PHENOMENON_THRESHOLDS.thunderstorm.capeLow)} J/kg avec au
                moins {formatCompact(PHENOMENON_THRESHOLDS.thunderstorm.precipMm)} mm de pluie dans
                l’heure (probable dès{' '}
                {formatCompact(PHENOMENON_THRESHOLDS.thunderstorm.capeModerate)}, fort dès{' '}
                {formatCompact(PHENOMENON_THRESHOLDS.thunderstorm.capeHigh)}). C’est une prévision,
                pas une mesure : elle ne dit ni où la foudre tombera ni si elle tombera. Une case
                pointillée n’a ni CAPE ni code météo. Une case tous les {formatCompact(grid.stepKm)}{' '}
                km, sans lissage.
              </>
            ) : (
              <>
                Prévu par {modelLabel} (maille {formatCompact(MODEL_SPECS[model].resolutionKm)} km),
                une case tous les {formatCompact(grid.stepKm)} km : la valeur calculée au centre de
                chaque case, sans lissage. Échelle des températures propre à la carte, sur toute la
                période.
              </>
            )}
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
