/*
 * Le pictogramme du temps pour le widget : un nom parmi dix, deduit du code
 * WMO du modele retenu. Le widget natif dessine l'icone ; ce choix reste ici,
 * en TypeScript pur et teste, comme tout ce qui decide de ce qui est affiche.
 * Un code absent ou inconnu ne donne aucune icone : rien n'est devine.
 */

export type WidgetIconName =
  | 'clear'
  | 'clearNight'
  | 'partly'
  | 'partlyNight'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

export function weatherIcon(code: number | null, isDay: boolean | null): WidgetIconName | null {
  if (code === null) {
    return null;
  }
  // Inconnu : le jour, comme la page.
  const night = isDay === false;
  if (code === 0) {
    return night ? 'clearNight' : 'clear';
  }
  if (code === 1 || code === 2) {
    return night ? 'partlyNight' : 'partly';
  }
  if (code === 3) {
    return 'cloudy';
  }
  if (code === 45 || code === 48) {
    return 'fog';
  }
  if (code >= 51 && code <= 57) {
    return 'drizzle';
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return 'rain';
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 'snow';
  }
  if (code >= 95 && code <= 99) {
    return 'thunder';
  }
  return null;
}

/** Du plus doux au plus marquant : le temps d'une periode est celui de son heure la plus marquante. */
const SEVERITY: Readonly<Record<WidgetIconName, number>> = {
  clearNight: 0,
  clear: 0,
  partlyNight: 1,
  partly: 1,
  cloudy: 2,
  fog: 3,
  drizzle: 4,
  rain: 5,
  snow: 6,
  thunder: 7,
};

/**
 * Le code de temps le plus marquant parmi des heures, ou null sans code connu. A gravite egale,
 * la premiere heure l'emporte. Sert au temps du reste de la journee : le resume quotidien d'un
 * modele couvre aussi les heures deja passees.
 */
export function mostSevereWeather(codes: readonly (number | null)[]): number | null {
  let best: number | null = null;
  let bestRank = -1;
  for (const code of codes) {
    const icon = weatherIcon(code, true);
    if (code === null || icon === null) {
      continue;
    }
    if (SEVERITY[icon] > bestRank) {
      best = code;
      bestRank = SEVERITY[icon];
    }
  }
  return best;
}
