import { DIAGNOSTIC_SOURCES } from '../data/cache/diagnostics';
import type { DiagnosticSource, Diagnostics, SourceDiagnostic } from '../data/cache/diagnostics';
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
  normals: 'Normales 1991-2020 (réanalyse ERA5)',
  marine: 'Mer et houle (Open-Meteo Marine)',
  lightning: 'Foudre observée (EUMETSAT, satellite MTG)',
  previousDay: 'Prévisions de la veille (Open-Meteo Previous Runs)',
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

export interface ReportContext {
  readonly now: Date;
  readonly userAgent: string;
  readonly online: boolean;
  /** Application installee (mode autonome) ou onglet de navigateur. */
  readonly installed: boolean;
  readonly language: string;
}

/**
 * Rapport de diagnostic en texte, a coller dans un message : le contexte du
 * navigateur et, pour chaque source, la derniere lecture reussie et le dernier
 * echec. Aucun lieu, aucune cle, aucune adresse : seulement des heures et la
 * nature des echecs.
 */
export function diagnosticReport(diagnostics: Diagnostics, context: ReportContext): string {
  const lines = [
    'Relevé, rapport de diagnostic',
    `Établi le ${context.now.toISOString()}`,
    `Navigateur : ${context.userAgent}`,
    `Langue : ${context.language} ; réseau : ${context.online ? 'en ligne' : 'hors ligne'} ; ${context.installed ? 'application installée' : 'onglet de navigateur'}`,
    '',
  ];
  for (const source of DIAGNOSTIC_SOURCES) {
    const sentences = diagnosticSentences(diagnostics[source]);
    lines.push(`${DIAGNOSTIC_LABELS[source]}`, `  ${sentences.success}`);
    if (sentences.failure !== null) {
      lines.push(`  ${sentences.failure}`);
    }
  }
  return lines.join('\n');
}
