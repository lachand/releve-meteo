import type { ReactNode } from 'react';

/*
 * Pictogrammes de la barre d'onglets des petits ecrans : traits d'encre sur
 * grille 24 x 24, une seule epaisseur. Jamais seuls : chaque onglet garde
 * son libelle, visible ou accessible.
 */

function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Aujourd'hui : un soleil. */
export function TodayIcon() {
  return (
    <Icon>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </Icon>
  );
}

/** Heure par heure : une horloge. */
export function HoursIcon() {
  return (
    <Icon>
      <circle cx={12} cy={12} r={8.5} />
      <path d="M12 7v5l3.2 2" />
    </Icon>
  );
}

/** 15 jours : un calendrier. */
export function DaysIcon() {
  return (
    <Icon>
      <rect x={4} y={5.5} width={16} height={14.5} rx={1.5} />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </Icon>
  );
}

/** Cartes : une epingle de carte. */
export function MapIcon() {
  return (
    <Icon>
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z" />
      <circle cx={12} cy={10} r={2.2} />
    </Icon>
  );
}

/** Modeles : des couches superposees. */
export function ModelsIcon() {
  return (
    <Icon>
      <path d="M12 4 3.5 8.5 12 13l8.5-4.5z" />
      <path d="M3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
    </Icon>
  );
}

/** Fiabilite : une cible touchee. */
export function ReliabilityIcon() {
  return (
    <Icon>
      <circle cx={12} cy={12} r={8.5} />
      <circle cx={12} cy={12} r={4.5} />
      <circle cx={12} cy={12} r={1} fill="currentColor" />
    </Icon>
  );
}

/** Imprimante : le bouton « Imprimer le relevé » de l'en-tete. */
export function PrintIcon() {
  return (
    <Icon>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="8" rx="1" />
      <path d="M7 14h10v6H7z" />
    </Icon>
  );
}

/** Trois points relies : le bouton « Copier le lien » de l'en-tete. */
export function ShareIcon() {
  return (
    <Icon>
      <circle cx={6} cy={12} r={2.5} />
      <circle cx={18} cy={6} r={2.5} />
      <circle cx={18} cy={18} r={2.5} />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </Icon>
  );
}

/** Coche : confirmation d'une copie. */
export function CheckIcon() {
  return (
    <Icon>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}
