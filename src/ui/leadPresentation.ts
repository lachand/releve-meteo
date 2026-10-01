import { SHORT_LEADS } from '../domain/leadScores';
import type { LeadScores } from '../domain/leadScores';
import { formatDayHour, formatOneDecimal } from './format';
import { MODEL_LABELS } from './modelPresentation';

/*
 * Phrases des echeances courtes. Tant que les paires manquent, l'ecran dit
 * « en collecte » et ce qui a deja ete enregistre : aucune note inventee.
 */

function degrees(value: number): string {
  return `${formatOneDecimal(value)}\u00a0°C`;
}

/** Le modele le plus juste de chaque echeance notee. */
export function leadHeadline(scores: LeadScores): string {
  const parts = scores.buckets.flatMap((bucket, index) => {
    const best = bucket.models[0];
    if (best === undefined) {
      return [];
    }
    const name = MODEL_LABELS[best.model];
    const first = index === scores.buckets.findIndex((b) => b.models.length > 0);
    return [
      first
        ? `Le plus juste à ${bucket.label} : ${name} (${degrees(best.mae)} d’erreur moyenne)`
        : `à ${bucket.label} : ${name} (${degrees(best.mae)})`,
    ];
  });
  return `${parts.join(' ; ')}.`;
}

export function collectingSentence(scores: LeadScores): string {
  if (scores.snapshots === 0 || scores.oldestIssuedAt === null) {
    return `Aucune prévision enregistrée pour l’instant : l’application en garde une par heure quand elle est ouverte, ou en arrière-plan si la veille est activée dans les réglages, puis la compare aux mesures. Il faut au moins ${SHORT_LEADS.minPairs} heures comparables par modèle et par échéance.`;
  }
  const count = `${scores.snapshots} ${scores.snapshots === 1 ? 'prévision enregistrée' : 'prévisions enregistrées'}`;
  return `En collecte : ${count} depuis ${formatDayHour(scores.oldestIssuedAt)}. Il faut au moins ${SHORT_LEADS.minPairs} heures comparables par modèle et par échéance ; elle n’enregistre que quand elle est ouverte, ou en arrière-plan si la veille est activée dans les réglages.`;
}
