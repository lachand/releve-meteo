import type { NowcastSummary } from '../domain/nowcast';
import { formatCompact, formatDuration } from './format';

export function nowcastSentence(summary: NowcastSummary): string {
  switch (summary.kind) {
    case 'unavailable':
      return 'Pluie à courte échéance indisponible.';
    case 'dry':
      return `Pas de pluie attendue d’ici ${formatDuration(Math.floor(summary.horizonMinutes / 15) * 15)}.`;
    case 'starting':
      return summary.inMinutes <= 0
        ? `La pluie commence, jusqu’à ${formatCompact(summary.peakMm)} mm par quart d’heure.`
        : `Pluie dans ${formatDuration(summary.inMinutes)}, jusqu’à ${formatCompact(summary.peakMm)} mm par quart d’heure.`;
    case 'ongoing':
      return summary.stopsInMinutes === null
        ? `Il pleut, sans accalmie annoncée sur deux heures (jusqu’à ${formatCompact(summary.peakMm)} mm par quart d’heure).`
        : `Il pleut ; fin prévue dans ${formatDuration(summary.stopsInMinutes)}.`;
  }
}
