import type { ReactElement } from 'react';
import { weatherCodeLabel } from '../weatherCodePresentation';

/*
 * Pictogrammes du temps : soleil (lune la nuit), nuage, gouttes, flocons,
 * eclair, brouillard. Lisibles sans legende, a la difference des symboles
 * synoptiques de l'OMM qu'ils remplacent (retour utilisateur du
 * 2026-09-28 : « difficilement comprehensibles »). Traces au trait d'encre
 * (currentColor), comme le reste du carnet, avec des lavis discrets pour
 * le soleil, la pluie, la neige et l'eclair (tokens --picto-*).
 *
 * Grille 32 x 32. L'intensite se lit au nombre de gouttes ou de flocons ;
 * l'etiquette texte reste toujours presente (visible ou accessible).
 */

const STROKE = 1.6;

const SUN = 'var(--picto-soleil)';
const MOON = 'var(--picto-lune)';
const CLOUD = 'var(--picto-nuage)';
const CLOUD_DARK = 'var(--picto-nuage-sombre)';
const RAIN = 'var(--picto-pluie)';
const SNOW = 'var(--picto-neige)';
const BOLT = 'var(--picto-eclair)';

function Sun({ cx, cy, r }: { readonly cx: number; readonly cy: number; readonly r: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const from = r + 2;
    const to = r + 4.2;
    return `M${(cx + from * Math.cos(a)).toFixed(2)} ${(cy + from * Math.sin(a)).toFixed(2)} L${(cx + to * Math.cos(a)).toFixed(2)} ${(cy + to * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <g>
      <path d={rays} stroke={SUN} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r} fill={SUN} />
    </g>
  );
}

/**
 * Croissant de lune : disque de rayon r entame par un second disque
 * decale vers le haut a droite. Les deux points d'intersection bornent
 * le croissant.
 */
function Moon({
  cx,
  cy,
  r,
  mirrored = false,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly mirrored?: boolean;
}) {
  const bx = cx + r * 0.62;
  const by = cy - r * 0.42;
  const rb = r * 0.86;
  // Intersection de deux cercles (geometrie classique).
  const dx = bx - cx;
  const dy = by - cy;
  const d = Math.hypot(dx, dy);
  const a = (r * r - rb * rb + d * d) / (2 * d);
  const h = Math.sqrt(r * r - a * a);
  const mx = cx + (a * dx) / d;
  const my = cy + (a * dy) / d;
  const p1 = `${(mx + (h * dy) / d).toFixed(2)} ${(my - (h * dx) / d).toFixed(2)}`;
  const p2 = `${(mx - (h * dy) / d).toFixed(2)} ${(my + (h * dx) / d).toFixed(2)}`;
  return (
    <path
      d={`M${p1} A${r} ${r} 0 1 0 ${p2} A${rb} ${rb} 0 0 1 ${p1} Z`}
      transform={mirrored ? `translate(${2 * cx} 0) scale(-1 1)` : undefined}
      fill={MOON}
      strokeLinejoin="round"
    />
  );
}

/**
 * Soleil le jour, lune la nuit. `behindLeft` : un nuage cache le bas
 * gauche, le croissant tourne son ventre vers la droite pour rester lu.
 */
function Sky({
  cx,
  cy,
  r,
  night,
  behindLeft = false,
}: {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly night: boolean;
  readonly behindLeft?: boolean;
}) {
  return night ? (
    <Moon cx={cx} cy={cy} r={r + 1} mirrored={behindLeft} />
  ) : (
    <Sun cx={cx} cy={cy} r={r} />
  );
}

/**
 * Nuage de 20 x 12 unites, base plate, pose en (x, y) coin haut gauche,
 * agrandi de `scale`. Rempli (papier ou gris) pour masquer ce qu'il couvre.
 */
function Cloud({
  x,
  y,
  scale = 1,
  dark = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly dark?: boolean;
}) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M4.6 12 H16 A3.9 3.9 0 0 0 16.3 4.3 A5.6 5.6 0 0 0 5.6 5.2 A3.4 3.4 0 0 0 4.6 12 Z"
      fill={dark ? CLOUD_DARK : CLOUD}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Abscisses des marques de precipitation sous le nuage, centrees. */
function columns(count: number): readonly number[] {
  const step = 5;
  const start = 16 - ((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function Drops({ count, top = 22 }: { readonly count: number; readonly top?: number }) {
  return (
    <g stroke={RAIN} strokeWidth={2.1}>
      {columns(count).map((x, i) => (
        // Une goutte sur deux decalee : pluie plutot que grille.
        <path key={x} d={`M${x + 0.8} ${top + (i % 2) * 2} l-1.6 4`} />
      ))}
    </g>
  );
}

function Drizzle({ count }: { readonly count: number }) {
  return (
    <g fill={RAIN} stroke="none">
      {columns(count).map((x, i) => (
        <circle key={x} cx={x} cy={24 + (i % 2) * 2.5} r={1.5} />
      ))}
    </g>
  );
}

function Flake({ x, y, r = 2.8 }: { readonly x: number; readonly y: number; readonly r?: number }) {
  const c = r * Math.cos(Math.PI / 6);
  const s = r * Math.sin(Math.PI / 6);
  return (
    <path
      d={`M${x} ${y - r} V${y + r} M${x - c} ${y - s} L${x + c} ${y + s} M${x - c} ${y + s} L${x + c} ${y - s}`}
      stroke={SNOW}
      strokeWidth={1.5}
    />
  );
}

function Flakes({ count }: { readonly count: number }) {
  return (
    <g>
      {columns(count).map((x, i) => (
        <Flake key={x} x={x} y={24.5 + (i % 2) * 2} />
      ))}
    </g>
  );
}

/** Pellets blancs cercles d'encre : grains de neige ou grele. */
function Pellets({ count, r = 1.5 }: { readonly count: number; readonly r?: number }) {
  return (
    <g fill={CLOUD} strokeWidth={1.2}>
      {columns(count).map((x, i) => (
        <circle key={x} cx={x} cy={24.5 + (i % 2) * 2.5} r={r} />
      ))}
    </g>
  );
}

/** Verglas : un cristal de glace au bout de la pluie. */
function Ice() {
  return <Flake x={25.5} y={25.5} r={2.6} />;
}

function Bolt() {
  return (
    <path
      d="M17.4 16.5 L12.6 23.6 H16 L14.2 30 L20.6 21.6 H17 L19.2 16.5 Z"
      fill={BOLT}
      strokeLinejoin="round"
      strokeWidth={1.3}
    />
  );
}

function FogLines({ rime }: { readonly rime: boolean }) {
  return (
    <g>
      <Cloud x={6} y={4} scale={1} />
      <path d="M5 21 H27 M8 25 H24 M5 29 H27" strokeWidth={1.8} opacity={0.75} />
      {rime && <Flake x={26} y={7} r={2.6} />}
    </g>
  );
}

/** Nuage de precipitation, haut du cadre. */
function RainCloud({ dark = false }: { readonly dark?: boolean }) {
  return <Cloud x={3} y={2.5} scale={1.3} dark={dark} />;
}

/** Soleil (ou lune) derriere un nuage : averses. */
function ShowerCloud({ night }: { readonly night: boolean }) {
  return (
    <g>
      <Sky cx={22} cy={8} r={4.3} night={night} behindLeft />
      <Cloud x={2} y={5} scale={1.15} />
    </g>
  );
}

/** Ciel de 0 (degage) a 3 (couvert). */
function SkyCover({ cover, night }: { readonly cover: 0 | 1 | 2 | 3; readonly night: boolean }) {
  switch (cover) {
    case 0:
      return <Sky cx={16} cy={16} r={6.5} night={night} />;
    case 1:
      return (
        <g>
          <Sky cx={14} cy={13} r={6.5} night={night} />
          <Cloud x={11.5} y={16.5} scale={0.88} />
        </g>
      );
    case 2:
      return (
        <g>
          <Sky cx={20.5} cy={10.5} r={5.5} night={night} behindLeft />
          <Cloud x={2} y={10} scale={1.3} />
        </g>
      );
    case 3:
      return (
        <g>
          <Cloud x={11} y={3.5} scale={0.95} dark />
          <Cloud x={1.5} y={10} scale={1.35} />
        </g>
      );
  }
}

/**
 * Ciel des codes 0 a 3, affine par la nebulosite quand elle est connue :
 * le code dit l'etat moyen, la nebulosite de l'heure le precise.
 */
function coverOf(code: 0 | 1 | 2 | 3, cloudCover: number | null): 0 | 1 | 2 | 3 {
  if (cloudCover === null) {
    return code;
  }
  if (cloudCover < 20) {
    return 0;
  }
  if (cloudCover < 50) {
    return 1;
  }
  return cloudCover < 85 ? 2 : 3;
}

function symbolBody(code: number, cloudCover: number | null, night: boolean): ReactElement | null {
  switch (code) {
    case 0:
    case 1:
    case 2:
    case 3:
      return <SkyCover cover={coverOf(code, cloudCover)} night={night} />;
    case 45:
      return <FogLines rime={false} />;
    case 48:
      return <FogLines rime />;
    case 51:
    case 53:
    case 55:
      return (
        <>
          <RainCloud />
          <Drizzle count={code === 51 ? 2 : code === 53 ? 3 : 4} />
        </>
      );
    case 56:
    case 57:
      return (
        <>
          <RainCloud />
          <g transform="translate(-3 0)">
            <Drizzle count={code === 56 ? 2 : 3} />
          </g>
          <Ice />
        </>
      );
    case 61:
    case 63:
    case 65:
      return (
        <>
          <RainCloud dark={code === 65} />
          <Drops count={code === 61 ? 2 : code === 63 ? 3 : 4} />
        </>
      );
    case 66:
    case 67:
      return (
        <>
          <RainCloud />
          <g transform="translate(-3 0)">
            <Drops count={code === 66 ? 2 : 3} />
          </g>
          <Ice />
        </>
      );
    case 71:
    case 73:
    case 75:
      return (
        <>
          <RainCloud dark={code === 75} />
          <Flakes count={code === 71 ? 2 : code === 73 ? 3 : 4} />
        </>
      );
    case 77:
      return (
        <>
          <RainCloud />
          <Pellets count={3} />
        </>
      );
    case 80:
    case 81:
    case 82:
      return (
        <>
          <ShowerCloud night={night} />
          <Drops count={code === 80 ? 2 : code === 81 ? 3 : 4} />
        </>
      );
    case 85:
    case 86:
      return (
        <>
          <ShowerCloud night={night} />
          <Flakes count={code === 85 ? 2 : 3} />
        </>
      );
    case 95:
      return (
        <>
          <RainCloud dark />
          <Bolt />
          <Drops count={2} top={21} />
        </>
      );
    case 96:
    case 99:
      return (
        <>
          <RainCloud dark />
          <Bolt />
          <g fill={CLOUD} strokeWidth={1.2}>
            <circle cx={8.5} cy={25} r={code === 99 ? 2.1 : 1.7} />
            <circle cx={24} cy={26.5} r={code === 99 ? 2.1 : 1.7} />
          </g>
        </>
      );
    default:
      return null;
  }
}

interface WeatherSymbolProps {
  readonly code: number | null;
  /** Nebulosite en %, affine le ciel pour les codes 0 a 3. */
  readonly cloudCover?: number | null;
  /** Nuit : la lune remplace le soleil. Inconnu (null) : jour. */
  readonly isDay?: boolean | null;
  readonly size?: number;
  /**
   * Libelle accessible. Par defaut, l'etiquette francaise du code. Passer
   * `decorative` quand le texte est deja affiche a cote.
   */
  readonly decorative?: boolean;
  readonly className?: string;
}

/** Pictogramme du temps, ou rien si le code est absent ou inconnu. */
export function WeatherSymbol({
  code,
  cloudCover = null,
  isDay = null,
  size = 28,
  decorative = false,
  className,
}: WeatherSymbolProps) {
  if (code === null) {
    return null;
  }
  const night = isDay === false;
  const body = symbolBody(code, cloudCover, night);
  if (body === null) {
    return null;
  }
  const label = weatherCodeLabel(code);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      data-symbol={code}
      data-night={night ? '' : undefined}
      {...(decorative || label === null
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      {body}
    </svg>
  );
}

/** Thermometre : tube d'encre, bulbe et colonne teintes, niveau haut ou bas. */
function Thermometer({ high, tint }: { readonly high: boolean; readonly tint: string }) {
  return (
    <g>
      <path d="M22.5 22 V7.5 a2.5 2.5 0 0 1 5 0 V22" />
      <path d={high ? 'M25 23 V9' : 'M25 23 V18'} stroke={tint} strokeWidth={2.2} />
      <circle cx={25} cy={25} r={3.6} fill={tint} />
    </g>
  );
}

interface PictoProps {
  readonly size?: number;
}

function Frame({ size = 32, children }: PictoProps & { readonly children: ReactElement }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Gel : flocon et thermometre au plus bas. */
export function FrostPicto({ size }: PictoProps) {
  return (
    <Frame size={size}>
      <g>
        <Flake x={11} y={15} r={7.5} />
        <Thermometer high={false} tint={SNOW} />
      </g>
    </Frame>
  );
}

/** Chaleur : soleil et thermometre au plus haut. */
export function HeatPicto({ size }: PictoProps) {
  return (
    <Frame size={size}>
      <g>
        <Sun cx={11} cy={13} r={5} />
        <Thermometer high tint="var(--alerte)" />
      </g>
    </Frame>
  );
}

/** Vent fort : traits de rafale enroules. */
export function WindPicto({ size }: PictoProps) {
  return (
    <Frame size={size}>
      <path
        d="M4 11.5 H19 a3.6 3.6 0 1 0 -3.6 -3.6 M4 17 H24.5 a3.6 3.6 0 1 1 -3.6 3.6 M4 22.5 H14"
        strokeWidth={2}
      />
    </Frame>
  );
}
