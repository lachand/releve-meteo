import { barbParts } from './barb';

/*
 * Barbule de vent de la carte synoptique : la hampe pointe vers la
 * direction d'ou vient le vent, les barbules sont au bout exterieur.
 * Demi-barbule 5 noeuds, barbule 10 noeuds, fanion 50 noeuds. Vent calme
 * (moins de 3 noeuds) : double cercle. Hemisphere nord : barbules a droite
 * de la hampe vue depuis la station.
 */

interface WindBarbProps {
  readonly speedKmh: number | null;
  readonly directionDeg: number | null;
  readonly size?: number;
  readonly label?: string;
}

export function WindBarb({ speedKmh, directionDeg, size = 36, label }: WindBarbProps) {
  if (speedKmh === null) {
    return null;
  }
  const parts = barbParts(speedKmh);
  const a11y =
    label === undefined ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': label };
  if (parts.calm || directionDeg === null) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        {...a11y}
      >
        <circle cx={20} cy={20} r={3} />
        {parts.calm && <circle cx={20} cy={20} r={6.5} />}
      </svg>
    );
  }
  // Hampe de (20,20) vers le haut (20,3) avant rotation ; elements depuis la pointe.
  const tip = 3;
  const spacing = 3.4;
  const elements: string[] = [];
  let y = tip;
  for (let i = 0; i < parts.pennants; i += 1) {
    elements.push(`M20 ${y} L28.5 ${y + 1.6} L20 ${y + spacing} Z`);
    y += spacing + 1;
  }
  for (let i = 0; i < parts.full; i += 1) {
    elements.push(`M20 ${y} L29 ${y - 3.2}`);
    y += spacing;
  }
  if (parts.half === 1) {
    // Une demi-barbule seule est decalee de la pointe, comme sur les cartes.
    const offset = parts.pennants === 0 && parts.full === 0 ? spacing : 0;
    elements.push(`M20 ${y + offset} L24.5 ${y + offset - 1.6}`);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      {...a11y}
    >
      <g transform={`rotate(${directionDeg} 20 20)`}>
        <path d={`M20 20 V${tip}`} />
        {elements.map((d, i) => (
          <path key={i} d={d} fill={d.endsWith('Z') ? 'currentColor' : 'none'} />
        ))}
      </g>
      <circle cx={20} cy={20} r={2.2} fill="currentColor" stroke="none" />
    </svg>
  );
}
