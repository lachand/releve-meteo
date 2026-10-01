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
