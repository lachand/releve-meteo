/*
 * Relevé dans son application Android : la page tourne dans une WebView qui
 * expose `ReleveAndroid`. Hors de l'application (navigateur, PWA installee),
 * l'objet n'existe pas et rien ne change.
 */

export interface AndroidAppBridge {
  /** Demande un calcul immediat du contenu des widgets. */
  readonly refreshWidgets?: () => void;
  /** « on », « off » ou « denied » (voulu, mais refuse par Android). */
  readonly notificationsState?: () => string;
  /** Active ou coupe les notifications d'alerte (demande l'autorisation a Android si besoin). */
  readonly setNotifications?: (on: boolean) => void;
}

export type AndroidNotificationsState = 'on' | 'off' | 'denied';

/** L'etat des notifications natives, ou null hors de l'application (ou dans une version qui ne les a pas). */
export function androidNotificationsState(): AndroidNotificationsState | null {
  const state = androidApp()?.notificationsState?.();
  return state === 'on' || state === 'off' || state === 'denied' ? state : null;
}

export function androidApp(): AndroidAppBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const bridge = (window as unknown as { ReleveAndroid?: AndroidAppBridge }).ReleveAndroid;
  return bridge ?? null;
}
