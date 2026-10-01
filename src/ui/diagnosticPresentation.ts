import type { DiagnosticSource, SourceDiagnostic } from '../data/cache/diagnostics';
import { localIsoFromUtc } from '../domain/time';
import { formatDayHour } from './format';

export const DIAGNOSTIC_LABELS: Readonly<Record<DiagnosticSource, string>> = {
  forecast: 'Prévisions (Open-Meteo)',
  ensemble: 'Ensemble ECMWF (Open-Meteo)',
  verification: 'Vérification (Open-Meteo et Meteostat)',
  station: 'Relevés de station (Meteostat)',
  vigilance: 'Vigilance (Météo-France, via Opendatasoft)',
  airQuality: 'Qualité de l’air et pollens (CAMS)',
  nowcast: 'Pluie au quart d’heure (AROME)',
  grid: 'Cartes de prévision (Open-Meteo)',
};

type Failure = NonNullable<SourceDiagnostic['lastFailure']>;

function failureSentence(failure: Failure): string {
  switch (failure.kind) {
    case 'rate_limited':
      return 'quota du service atteint';
    case 'server_error':
      return failure.status === null
        ? 'le service a répondu une erreur'
        : `le service a répondu une erreur ${failure.status}`;
    case 'network':
      return 'réseau injoignable';
    case 'timeout':
      return 'délai dépassé';
    case 'aborted':
      return 'requête interrompue';
    case 'malformed':
      return 'réponse illisible';
  }
}

const at = (epochMs: number): string => formatDayHour(localIsoFromUtc(epochMs));

/** Dernière lecture réussie et dernier échec d'une source, en une phrase chacune. */
export function diagnosticSentences(entry: SourceDiagnostic): {
  readonly success: string;
  readonly failure: string | null;
} {
  return {
    success:
      entry.lastSuccess === null
        ? 'Aucune lecture réussie notée sur cet appareil.'
        : `Dernière lecture réussie : ${at(entry.lastSuccess)}.`,
    failure:
      entry.lastFailure === null
        ? null
        : `Dernier échec : ${at(entry.lastFailure.at)}, ${failureSentence(entry.lastFailure)}.`,
  };
}
