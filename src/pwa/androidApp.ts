/*
 * Relevé dans son application Android : la page tourne dans une WebView qui
 * expose `ReleveAndroid`. Hors de l'application (navigateur, PWA installee),
 * l'objet n'existe pas et rien ne change.
 */

export interface AndroidAppBridge {
  /** Demande un calcul immediat du contenu des widgets. */
  readonly refreshWidgets?: () => void;
}

export function androidApp(): AndroidAppBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const bridge = (window as unknown as { ReleveAndroid?: AndroidAppBridge }).ReleveAndroid;
  return bridge ?? null;
}
