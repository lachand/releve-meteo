import type { Briefing } from '../domain/briefing';
import type { DayDigest } from '../domain/dayDigest';
import type { Preferences } from '../domain/types';
import { briefingSentence } from './briefingPresentation';
import { formatCompact, formatOneDecimal, formatTemperature } from './format';
import { convertWindSpeed, windUnitLabel } from './windUnit';

/*
 * Texte du resume du matin : la phrase du bulletin (modele nomme, ecart des
 * autres modeles chiffre), puis les 24 heures a venir. Une grandeur absente
 * est omise, jamais ecrite comme zero.
 */

type WindUnit = Preferences['units']['wind'];

function dayLine(digest: DayDigest, windUnit: WindUnit): string | null {
  const parts: string[] = [];
  if (digest.tempMin !== null && digest.tempMax !== null) {
    parts.push(
      `de ${formatTemperature(digest.tempMin)} à ${formatTemperature(digest.tempMax)}\u00a0°C`,
    );
  }
  if (digest.rainMm !== null) {
    parts.push(
      digest.rainMm === 0 ? 'pas de pluie' : `${formatOneDecimal(digest.rainMm)}\u00a0mm de pluie`,
    );
  }
  const gust = digest.gustMax === null ? null : convertWindSpeed(digest.gustMax, windUnit);
  if (gust !== null) {
    parts.push(
      `rafales jusqu’à ${formatCompact(Math.round(gust))}\u00a0${windUnitLabel(windUnit)}`,
    );
  }
  return parts.length === 0 ? null : `Sur 24\u00a0h\u00a0: ${parts.join(', ')}.`;
}

/** Corps de la notification, ou null quand il n'y a rien a dire. */
export function digestBody(
  briefing: Briefing | null,
  digest: DayDigest | null,
  windUnit: WindUnit,
): string | null {
  const sentences = [
    briefing === null ? null : briefingSentence(briefing),
    digest === null ? null : dayLine(digest, windUnit),
  ].filter((sentence): sentence is string => sentence !== null);
  return sentences.length === 0 ? null : sentences.join(' ');
}
