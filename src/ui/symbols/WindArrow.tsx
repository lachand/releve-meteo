/*
 * Fleche de vent : elle pointe la ou va le vent, comme on le sent sur le
 * terrain. La direction d'origine (« du SO ») est toujours ecrite a cote :
 * la convention meteorologique (d'ou vient le vent) reste dans le texte,
 * jamais dans le seul dessin. Remplace la barbule synoptique, jugee
 * difficile a lire (retour utilisateur du 2026-09-28).
 *
 * Le trait s'epaissit avec la force du vent ; en dessous de 5 km/h, un
 * cercle dit « calme ».
 */

import { windStrength } from './windStrength';
import type { WindStrength } from './windStrength';

const STROKE: Readonly<Record<Exclude<WindStrength, 'calm'>, number>> = {
  light: 1.7,
  moderate: 2.4,
  strong: 3.1,
  veryStrong: 3.8,
};

interface WindArrowProps {
  readonly speedKmh: number | null;
  /** Direction d'ou vient le vent, degres (convention meteorologique). */
  readonly directionDeg: number | null;
  readonly size?: number;
  readonly label?: string;
}

export function WindArrow({ speedKmh, directionDeg, size = 32, label }: WindArrowProps) {
  if (speedKmh === null) {
    return null;
  }
  const strength = windStrength(speedKmh);
  const a11y =
    label === undefined ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label };
  if (strength === 'calm' || directionDeg === null) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        data-wind={strength === 'calm' ? 'calm' : 'unknown'}
        {...a11y}
      >
        <circle cx={16} cy={16} r={strength === 'calm' ? 5 : 2} />
      </svg>
    );
  }
  const width = STROKE[strength];
  // Dessinee vers le haut (vers le nord), puis tournee vers la ou va le vent.
  const heading = (directionDeg + 180) % 360;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-wind={strength}
      data-heading={Math.round(heading)}
      {...a11y}
    >
      <g transform={`rotate(${heading} 16 16)`}>
        <path d="M16 27 V9" strokeWidth={width} />
        <path d="M9.5 12.5 L16 4.5 L22.5 12.5 Z" fill="currentColor" strokeWidth={1.2} />
      </g>
    </svg>
  );
}
