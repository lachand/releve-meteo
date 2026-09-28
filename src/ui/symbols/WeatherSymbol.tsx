import { useId } from 'react';
import type { ReactElement } from 'react';
import { weatherCodeLabel } from '../weatherCodePresentation';

/*
 * Symboles synoptiques de l'OMM (temps present, nebulosite en octas), le
 * vocabulaire graphique des cartes d'observation et des carnets de
 * meteorologue : point de pluie, virgule de bruine, asterisque de neige,
 * triangle d'averse, eclair en crochet d'orage, traits de brouillard,
 * cercle de station rempli par huitiemes. Trace au trait, une seule encre
 * (currentColor) : la couleur reste reservee aux modeles (DESIGN.md 5).
 *
 * Grille 32 x 32. Tous les traces partagent la meme epaisseur.
 */

const STROKE = 1.7;

interface Mark {
  readonly x: number;
  readonly y: number;
}

function Dot({ x, y }: Mark) {
  return <circle cx={x} cy={y} r={2.2} fill="currentColor" stroke="none" />;
}

function Comma({ x, y }: Mark) {
  return (
    <g>
      <circle cx={x} cy={y} r={2} fill="currentColor" stroke="none" />
      <path d={`M${x + 1.8} ${y + 0.4} q0.2 3 -2.6 4.4`} fill="none" />
    </g>
  );
}

function Asterisk({ x, y }: Mark) {
  const r = 3.2;
  const c = r * Math.cos(Math.PI / 6);
  const s = r * Math.sin(Math.PI / 6);
  return (
    <path
      d={`M${x} ${y - r} V${y + r} M${x - c} ${y - s} L${x + c} ${y + s} M${x - c} ${y + s} L${x + c} ${y - s}`}
      fill="none"
    />
  );
}

function HailStone({ x, y }: Mark) {
  return <path d={`M${x} ${y - 2.6} L${x + 2.6} ${y + 2} H${x - 2.6} Z`} fill="currentColor" />;
}

/** Trois, deux ou une marque disposees en triangle, en paire ou seule. */
function arrangement(count: 1 | 2 | 3 | 4, cx: number, cy: number): readonly Mark[] {
  switch (count) {
    case 1:
      return [{ x: cx, y: cy }];
    case 2:
      return [
        { x: cx - 4.5, y: cy },
        { x: cx + 4.5, y: cy },
      ];
    case 3:
      return [
        { x: cx, y: cy - 4 },
        { x: cx - 4.5, y: cy + 3.5 },
        { x: cx + 4.5, y: cy + 3.5 },
      ];
    case 4:
      return [
        { x: cx, y: cy - 6 },
        { x: cx - 5, y: cy },
        { x: cx + 5, y: cy },
        { x: cx, y: cy + 6 },
      ];
  }
}

function marks(kind: 'dot' | 'comma' | 'star', count: 1 | 2 | 3 | 4, cx = 16, cy = 16) {
  const Shape = kind === 'dot' ? Dot : kind === 'comma' ? Comma : Asterisk;
  return arrangement(count, cx, cy).map((m, i) => <Shape key={i} x={m.x} y={m.y} />);
}

/** Signe de congelation : onde sous le signe de precipitation. */
function FreezingWave() {
  return <path d="M6 25.5 c2.5 -3 5.5 -3 8 0 s5.5 3 8 0 s3.2 -2 4 -1.4" fill="none" />;
}

/** Triangle d'averse, pointe en bas ; plein pour une averse forte. */
function ShowerTriangle({ filled }: { readonly filled: boolean }) {
  return (
    <path d="M10 17 H22 L16 27 Z" fill={filled ? 'currentColor' : 'none'} strokeLinejoin="round" />
  );
}

/** Crochet d'orage : le « R » de la carte synoptique, fleche a la pointe. */
function Thunder() {
  return (
    <g>
      <path d="M8.5 27 V9 H21 L15.5 17.5 H22 L16.5 27" fill="none" strokeLinejoin="round" />
      <path d="M16.5 27 L16.8 23 M16.5 27 L19.8 25" fill="none" />
    </g>
  );
}

function FogLines({ rime }: { readonly rime: boolean }) {
  return (
    <g>
      <path d="M7 11 H25 M7 16 H25 M7 21 H25" fill="none" />
      {rime && <path d="M4.5 9 V23 M27.5 9 V23" fill="none" />}
    </g>
  );
}

function SnowGrains() {
  return (
    <g>
      <path d="M16 10 L21 19 H11 Z" fill="none" strokeLinejoin="round" />
      <path d="M7 16 H25" fill="none" />
    </g>
  );
}

/**
 * Cercle de station rempli selon la nebulosite en octas (symbole N de
 * l'OMM) : 0 vide, 1 trait vertical, 2 quart, 4 moitie, 6 trois quarts,
 * 7 plein ouvert d'un trait, 8 plein.
 */
export function Octas({ octas, r = 9 }: { readonly octas: number; readonly r?: number }) {
  // useId() contient des « : », invalides dans une reference url(#...) ; jsdom
  // n'a pas CSS.escape : on ne garde que les caracteres surs.
  const hatchId = `octas${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const n = Math.max(0, Math.min(8, Math.round(octas)));
  const c = 16;
  const sector = (from: number, to: number) => {
    const a0 = ((from - 90) * Math.PI) / 180;
    const a1 = ((to - 90) * Math.PI) / 180;
    const large = to - from > 180 ? 1 : 0;
    return `M${c} ${c} L${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`;
  };
  const filledSweep = n >= 7 ? 360 : n >= 6 ? 270 : n >= 4 ? 180 : n >= 2 ? 90 : 0;
  // Ombrage a la plume : hachures fines plutot qu'un aplat, plus leger a
  // l'oeil sur un ruban de 24 symboles, sans changer la lecture en octas.
  const fill = `url(#${hatchId})`;
  return (
    <g>
      <defs>
        <pattern
          id={hatchId}
          patternUnits="userSpaceOnUse"
          width={2.4}
          height={2.4}
          patternTransform="rotate(45)"
        >
          <line x1={0} y1={0} x2={0} y2={2.4} stroke="currentColor" strokeWidth={1.35} />
        </pattern>
      </defs>
      {filledSweep === 360 && <circle cx={c} cy={c} r={r} fill={fill} stroke="none" />}
      {filledSweep > 0 && filledSweep < 360 && (
        <path d={sector(0, filledSweep)} fill={fill} stroke="none" />
      )}
      <circle cx={c} cy={c} r={r} fill="none" />
      {(n === 1 || n === 3 || n === 5) && <path d={`M${c} ${c - r} V${c + r}`} fill="none" />}
      {n === 7 && (
        <path
          d={`M${c} ${c - r} V${c + r}`}
          fill="none"
          stroke="var(--papier-haut)"
          strokeWidth={2.2}
        />
      )}
    </g>
  );
}

/** Octas a partir d'un code de ciel (0 a 3) si la nebulosite est inconnue. */
function octasFromCode(code: number): number {
  return [0, 2, 4, 8][code] ?? 0;
}

function symbolBody(code: number, cloudCover: number | null): ReactElement | null {
  switch (code) {
    case 0:
    case 1:
    case 2:
    case 3:
      return <Octas octas={cloudCover === null ? octasFromCode(code) : cloudCover / 12.5} />;
    case 45:
      return <FogLines rime={false} />;
    case 48:
      return <FogLines rime />;
    case 51:
      return <>{marks('comma', 2)}</>;
    case 53:
      return <>{marks('comma', 3)}</>;
    case 55:
      return <>{marks('comma', 4)}</>;
    case 56:
      return (
        <>
          {marks('comma', 2, 16, 12)}
          <FreezingWave />
        </>
      );
    case 57:
      return (
        <>
          {marks('comma', 3, 16, 12)}
          <FreezingWave />
        </>
      );
    case 61:
      return <>{marks('dot', 2)}</>;
    case 63:
      return <>{marks('dot', 3)}</>;
    case 65:
      return <>{marks('dot', 4)}</>;
    case 66:
      return (
        <>
          {marks('dot', 2, 16, 12)}
          <FreezingWave />
        </>
      );
    case 67:
      return (
        <>
          {marks('dot', 3, 16, 12)}
          <FreezingWave />
        </>
      );
    case 71:
      return <>{marks('star', 2)}</>;
    case 73:
      return <>{marks('star', 3)}</>;
    case 75:
      return <>{marks('star', 4)}</>;
    case 77:
      return <SnowGrains />;
    case 80:
      return (
        <>
          <Dot x={16} y={10} />
          <ShowerTriangle filled={false} />
        </>
      );
    case 81:
      return (
        <>
          <Dot x={12.5} y={10} />
          <Dot x={19.5} y={10} />
          <ShowerTriangle filled={false} />
        </>
      );
    case 82:
      return (
        <>
          <Dot x={12.5} y={10} />
          <Dot x={19.5} y={10} />
          <ShowerTriangle filled />
        </>
      );
    case 85:
      return (
        <>
          <Asterisk x={16} y={9.5} />
          <ShowerTriangle filled={false} />
        </>
      );
    case 86:
      return (
        <>
          <Asterisk x={16} y={9.5} />
          <ShowerTriangle filled />
        </>
      );
    case 95:
      return (
        <>
          <Thunder />
          <Dot x={25.5} y={6} />
        </>
      );
    case 96:
    case 99:
      return (
        <>
          <Thunder />
          <HailStone x={25.5} y={6} />
        </>
      );
    default:
      return null;
  }
}

interface WeatherSymbolProps {
  readonly code: number | null;
  /** Nebulosite en %, affine le cercle de station pour les codes 0 a 3. */
  readonly cloudCover?: number | null;
  readonly size?: number;
  /**
   * Libelle accessible. Par defaut, l'etiquette francaise du code. Passer
   * `decorative` quand le texte est deja affiche a cote.
   */
  readonly decorative?: boolean;
  readonly className?: string;
}

/** Symbole du temps present, ou rien si le code est absent ou inconnu. */
export function WeatherSymbol({
  code,
  cloudCover = null,
  size = 28,
  decorative = false,
  className,
}: WeatherSymbolProps) {
  if (code === null) {
    return null;
  }
  const body = symbolBody(code, cloudCover);
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
      {...(decorative || label === null
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': label })}
    >
      {body}
    </svg>
  );
}
