import type { ForecastBundle, Preferences } from '../../domain/types';
import type { CascadeView } from '../hooks/useCascadeView';
import { MODEL_LABELS } from '../modelLabels';
import { convertWindSpeed, windUnitLabel } from '../windUnit';
import { formatInteger } from '../format';
import { WIND_STRENGTH_KMH } from '../symbols/windStrength';
import { ROSE_CLASSES, guideStep, mainClass, windRoseData } from '../windRose';
import type { RoseClass, RoseDirection } from '../windRose';
import styles from './WindRose.module.css';

/*
 * Rose des vents a la maniere des releves climatologiques : un petale par
 * secteur, qui pointe d'ou vient le vent, long du nombre d'heures, decoupe
 * par force du vent du plus clair au plus fonce. Les heures de calme sont
 * au centre. Trace en SVG, sans animation, avec sa phrase de synthese et
 * sa table equivalente.
 */

const WINDOW_HOURS = 48;

const SIZE = 300;
const C = SIZE / 2;
const R_CALM = 17;
const R_MAX = 108;
const R_RING = 118;
const R_LABEL = 136;
/** Demi-ouverture d'un petale, degres (secteurs de 45 degres). */
const HALF_PETAL = 16;

type WindUnit = Preferences['units']['wind'];

/** « d'est », « du sud-ouest » : la direction en toutes lettres. */
const FROM_WORDS: Readonly<Record<RoseDirection, string>> = {
  N: 'du nord',
  NE: 'du nord-est',
  E: 'd’est',
  SE: 'du sud-est',
  S: 'du sud',
  SO: 'du sud-ouest',
  O: 'd’ouest',
  NO: 'du nord-ouest',
};

const CLASS_WORDS: Readonly<Record<RoseClass, string>> = {
  light: 'faible',
  moderate: 'modéré',
  strong: 'fort',
  veryStrong: 'très fort',
};

function point(r: number, degrees: number): string {
  const a = (degrees * Math.PI) / 180;
  return `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
}

/** Portion d'anneau entre deux rayons, de part et d'autre d'un cap. */
function segment(r1: number, r2: number, heading: number): string {
  const a1 = heading - HALF_PETAL;
  const a2 = heading + HALF_PETAL;
  return `M${point(r1, a1)} L${point(r2, a1)} A${r2} ${r2} 0 0 1 ${point(r2, a2)} L${point(r1, a2)} A${r1} ${r1} 0 0 0 ${point(r1, a1)} Z`;
}

function speed(kmh: number, unit: WindUnit): string {
  return formatInteger(convertWindSpeed(kmh, unit));
}

/** « moins de 20 km/h », « 20 à 40 km/h », « 60 km/h et plus ». */
function classRange(index: number, unit: WindUnit): string {
  const label = windUnitLabel(unit);
  const low = WIND_STRENGTH_KMH[index - 1];
  const high = WIND_STRENGTH_KMH[index];
  if (low === undefined && high !== undefined) {
    return `moins de ${speed(high, unit)} ${label}`;
  }
  if (high === undefined && low !== undefined) {
    return `${speed(low, unit)} ${label} et plus`;
  }
  return `${speed(low ?? 0, unit)} à ${speed(high ?? 0, unit)} ${label}`;
}

function hoursWord(n: number): string {
  return n === 1 ? '1 heure' : `${n} heures`;
}

interface WindRoseProps {
  readonly bundle: ForecastBundle;
  readonly cascade: CascadeView;
  readonly windUnit?: WindUnit;
}

export function WindRose({ bundle, cascade, windUnit = 'kmh' }: WindRoseProps) {
  const start = cascade.nowIndex === -1 ? 0 : cascade.nowIndex;
  const end = Math.min(start + WINDOW_HOURS, bundle.timeline.length);
  const rose = windRoseData(cascade, start, end);
  const longest = Math.max(0, ...rose.sectors.map((sector) => sector.total));
  const step = guideStep(longest);
  const scale = Math.max(step, Math.ceil(longest / step) * step);
  const radius = (hours: number) => R_CALM + ((R_MAX - R_CALM) * hours) / scale;
  const guides = Array.from({ length: Math.round(scale / step) }, (_, i) => (i + 1) * step);

  const summary =
    rose.dominant === null
      ? `Vent calme ou sans direction sur les ${WINDOW_HOURS} prochaines heures.`
      : `Vent dominant ${FROM_WORDS[rose.dominant.direction]} : ${hoursWord(rose.dominant.total)} sur ${rose.hours}, surtout ${CLASS_WORDS[mainClass(rose.dominant)]}.`;

  return (
    <figure className={styles.rose}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Rose des vents sur ${WINDOW_HOURS} heures. ${summary}`}
      >
        {/* Cercles de repere, graduees en heures. */}
        <g className={styles.guides}>
          {guides.map((hours) => (
            <circle key={hours} cx={C} cy={C} r={radius(hours)} />
          ))}
        </g>
        <g className={styles.guideLabels}>
          {guides.map((hours) => {
            const [x, y] = point(radius(hours), 22.5).split(' ');
            return (
              <text key={hours} x={x} y={y} dx={3} dy={-2}>
                {hours} h
              </text>
            );
          })}
        </g>

        {/* Couronne de la boussole : graduations tous les 22,5 degres. */}
        <circle className={styles.ring} cx={C} cy={C} r={R_RING} />
        <g className={styles.ticks}>
          {Array.from({ length: 16 }, (_, i) => i * 22.5).map((deg) => (
            <path
              key={deg}
              d={`M${point(R_RING, deg)} L${point(R_RING + (deg % 90 === 0 ? 8 : deg % 45 === 0 ? 5 : 3), deg)}`}
            />
          ))}
        </g>
        {rose.sectors.map((sector, index) => {
          const deg = index * 45;
          const [x, y] = point(R_LABEL, deg).split(' ');
          return (
            <text
              key={sector.direction}
              className={deg % 90 === 0 ? styles.cardinal : styles.intercardinal}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {sector.direction}
            </text>
          );
        })}

        {/* Petales : chaque classe de force empilee depuis le centre. */}
        <g className={styles.petals}>
          {rose.sectors.map((sector, index) => {
            let inner = 0;
            return sector.byClass.map((count, level) => {
              if (count === 0) {
                return null;
              }
              const from = inner;
              inner += count;
              return (
                <path
                  key={`${sector.direction}-${level}`}
                  d={segment(radius(from), radius(inner), index * 45)}
                  data-class={ROSE_CLASSES[level]}
                  className={styles.petal}
                />
              );
            });
          })}
        </g>

        {/* Calme au centre. */}
        <circle className={styles.calm} cx={C} cy={C} r={R_CALM} />
        <text
          className={styles.calmCount}
          x={C}
          y={C}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {rose.calm}
        </text>
      </svg>

      <figcaption className={styles.caption}>
        <p className={styles.summary}>{summary}</p>
        <ul className={styles.legend} aria-label="Force du vent">
          {ROSE_CLASSES.map((level, index) => (
            <li key={level}>
              <span className={styles.swatch} data-class={level} aria-hidden="true" />
              {CLASS_WORDS[level]}, {classRange(index, windUnit)}
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Chaque pétale pointe d’où vient le vent ; sa longueur compte les heures. Au centre, les
          heures de calme ({hoursWord(rose.calm)}).
          {rose.models.length > 0 &&
            ` Heures du modèle retenu : ${rose.models.map((m) => MODEL_LABELS[m]).join(', puis ')}.`}
        </p>
      </figcaption>

      <div className={styles.dataTable}>
        <table>
          <caption>Répartition de la direction du vent sur {WINDOW_HOURS} heures</caption>
          <thead>
            <tr>
              <th scope="col">Vent du</th>
              {ROSE_CLASSES.map((level) => (
                <th key={level} scope="col">
                  {CLASS_WORDS[level]}
                </th>
              ))}
              <th scope="col">Heures</th>
            </tr>
          </thead>
          <tbody>
            {rose.sectors.map((sector) => (
              <tr key={sector.direction}>
                <th scope="row">{sector.direction}</th>
                {sector.byClass.map((count, level) => (
                  <td key={ROSE_CLASSES[level]}>{count}</td>
                ))}
                <td>{sector.total}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Calme</th>
              <td colSpan={ROSE_CLASSES.length}>moins de 5 km/h</td>
              <td>{rose.calm}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </figure>
  );
}
