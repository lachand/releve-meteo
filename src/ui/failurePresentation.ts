import type { HttpFailure } from '../data/clients/http';
import { localIsoFromUtc } from '../domain/time';

/*
 * Phrases d'echec de la prevision. Un quota atteint n'est pas une panne :
 * on le dit, avec l'heure de reprise quand le serveur la donne, et on
 * rappelle que ce qui est deja charge reste lisible.
 */

/** En deca, l'attente annoncee n'est pas une heure de reprise mais un simple delai de politesse. */
const MIN_RETRY_AT_MS = 60 * 1000;

function clock(utcMs: number): string {
  const iso = localIsoFromUtc(utcMs);
  return `${iso.slice(11, 13)}h${iso.slice(14, 16)}`;
}

export function forecastFailureSentence(failure: HttpFailure, nowMs: number): string {
  if (failure.kind !== 'rate_limited') {
    return 'Le service de prévision Open-Meteo ne répond pas. Vérifiez la connexion puis réessayez.';
  }
  if (failure.retryAfterMs >= MIN_RETRY_AT_MS) {
    return `Le quota gratuit d’Open-Meteo est atteint. Réessayez vers ${clock(nowMs + failure.retryAfterMs)} : les relevés déjà chargés restent lisibles hors ligne.`;
  }
  return 'Le quota gratuit d’Open-Meteo est atteint (limites par minute, par heure et par jour). Réessayez dans quelques minutes ; si cela dure, demain : les relevés déjà chargés restent lisibles hors ligne.';
}
