import { MODEL_SPECS } from '../domain/models';
import type {
  Criterion,
  IneligibilityReason,
  ModelRanking,
  SwitchReason,
} from '../domain/modelSelection';
import type { ModelVerification } from '../domain/reliability';
import type { ModelId, TerrainKind, WeatherVariable } from '../domain/types';
import { formatCompact, formatOneDecimal } from './format';
import { MODEL_LABELS, TERRAIN_KIND_LABELS } from './modelPresentation';

/*
 * Redaction de la justification du choix de modele (ROADMAP.md A3), a
 * partir des criteres chiffres du score : chaque phrase correspond a un
 * critere reel, aucune formule toute faite.
 */

export const VARIABLE_UNITS: Readonly<Record<WeatherVariable, string>> = {
  temperature: '°C',
  precipitation: 'mm',
  wind: 'km/h',
};

export const VARIABLE_LABELS: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'Température',
  precipitation: 'Précipitations',
  wind: 'Vent',
};

const VARIABLE_WITH_ARTICLE: Readonly<Record<WeatherVariable, string>> = {
  temperature: 'la température',
  precipitation: 'les précipitations',
  wind: 'le vent',
};

const TERRAIN_REASON: Readonly<Record<TerrainKind, string>> = {
  mountain: 'le relief crée ici des effets locaux que seule une maille fine résout',
  coastal: 'le trait de côte crée ici brises et contrastes que seule une maille fine résout',
  plateau: 'le relief modéré profite d’une maille fine',
  plain: 'en plaine, la maille compte surtout pour les averses et orages',
};

export const INELIGIBILITY_LABELS: Readonly<Record<IneligibilityReason, string>> = {
  unavailable: 'absent de la réponse du service pour ce lieu',
  outOfDomain: 'ce lieu est hors de son domaine de calcul',
  outOfRange: 'cette échéance dépasse sa portée',
};

/** Phrase courte pour un critere, ou null si sa contribution est negligeable. */
export function criterionSentence(model: ModelId, criterion: Criterion): string | null {
  const spec = MODEL_SPECS[model];
  switch (criterion.kind) {
    case 'resolution': {
      if (criterion.points < 1) {
        return null;
      }
      const terrain = criterion.detail.terrain ?? 'plain';
      return `Maille de ${formatCompact(spec.resolutionKm)}\u00a0km\u00a0: ${TERRAIN_REASON[terrain]} (terrain ${TERRAIN_KIND_LABELS[terrain]}).`;
    }
    case 'mediumRange': {
      if (criterion.points < 1) {
        return null;
      }
      return model === 'ecmwf'
        ? 'Référence mondiale au-delà de deux ou trois jours, selon les vérifications internationales.'
        : `Tenue correcte en moyenne échéance pour un modèle ${spec.domain === 'global' ? 'global' : 'régional'}.`;
    }
    case 'localSkill': {
      const { mae, peerMae, sampleCount, variable, leadDays } = criterion.detail;
      if (
        mae === undefined ||
        peerMae === undefined ||
        variable === undefined ||
        leadDays === undefined ||
        sampleCount === undefined
      ) {
        return null;
      }
      const unit = `\u00a0${VARIABLE_UNITS[variable]}`;
      // peerMae est la moyenne des autres modeles : la phrase le dit, pour ne
      // jamais laisser croire au meilleur score quand un autre fait mieux.
      const figures = `${formatOneDecimal(mae)}${unit} d’erreur moyenne à J+${leadDays} sur ${sampleCount}\u00a0h vérifiées, contre ${formatOneDecimal(peerMae)}${unit} en moyenne pour les autres`;
      return mae <= peerMae
        ? `Plus juste ici que la moyenne des modèles sur ${VARIABLE_WITH_ARTICLE[variable]}\u00a0: ${figures}.`
        : `Moins juste ici que la moyenne des modèles sur ${VARIABLE_WITH_ARTICLE[variable]}\u00a0: ${figures}.`;
    }
    case 'shortSkill': {
      const { mae, peerMae, sampleCount, bucket } = criterion.detail;
      if (
        mae === undefined ||
        peerMae === undefined ||
        sampleCount === undefined ||
        bucket === undefined
      ) {
        return null;
      }
      // Station a station, sur les prevues que l'application a elle-meme
      // enregistrees : la phrase dit d'ou vient la mesure et sur quoi elle porte.
      const figures = `${formatOneDecimal(mae)}\u00a0°C d’erreur moyenne à ${bucket} d’échéance sur ${sampleCount}\u00a0h comparées à la station, contre ${formatOneDecimal(peerMae)}\u00a0°C en moyenne pour les autres`;
      return mae <= peerMae
        ? `Plus proche des mesures de la station que la moyenne des modèles à courte échéance\u00a0: ${figures}.`
        : `Moins proche des mesures de la station que la moyenne des modèles à courte échéance\u00a0: ${figures}.`;
    }
  }
}

/**
 * La raison d'une bascule de la cascade en une phrase : celle du critere qui
 * a le plus pese, avec ses chiffres, ou la limite de l'ancien modele.
 */
export function switchSentence(reason: SwitchReason): string {
  const from = MODEL_LABELS[reason.from];
  const to = MODEL_LABELS[reason.to];
  const hours = `${formatCompact(Math.round(reason.leadHours))}\u00a0h`;
  switch (reason.kind) {
    case 'availability': {
      const spec = MODEL_SPECS[reason.from];
      const limit =
        reason.cause === 'outOfRange'
          ? `${from} ne couvre pas plus de ${formatCompact(spec.maxLeadHours)}\u00a0h d’échéance`
          : reason.cause === 'outOfDomain'
            ? `Ce lieu est hors du domaine de calcul de ${from}`
            : reason.cause === 'unavailable'
              ? `${from} est absent de la réponse du service pour ce lieu`
              : `${from} n’a plus de valeur à partir de là`;
      return `${limit}\u00a0: ${to} prend le relais.`;
    }
    case 'manual':
      return `${to}, votre choix, couvre l’échéance à partir de là ; la sélection automatique aurait gardé ${from} jusqu’ici.`;
    case 'resolution': {
      const terrain = reason.toDetail?.terrain ?? 'plain';
      return `À ${hours} d’échéance, ${to} (maille de ${formatCompact(MODEL_SPECS[reason.to].resolutionKm)}\u00a0km) convient mieux que ${from} (${formatCompact(MODEL_SPECS[reason.from].resolutionKm)}\u00a0km) sur un terrain ${TERRAIN_KIND_LABELS[terrain]}.`;
    }
    case 'mediumRange':
      return `À ${hours} d’échéance, la maille compte moins : ${to} tient mieux la moyenne échéance que ${from}.`;
    case 'localSkill': {
      const { mae, variable, leadDays } = reason.toDetail ?? {};
      if (mae === undefined || variable === undefined || leadDays === undefined) {
        return `${to} a été plus juste que ${from} ici, sur les vérifications locales.`;
      }
      const unit = `\u00a0${VARIABLE_UNITS[variable]}`;
      const versus =
        reason.fromDetail?.mae !== undefined &&
        reason.fromDetail.variable === variable &&
        reason.fromDetail.leadDays === leadDays
          ? `, contre ${formatOneDecimal(reason.fromDetail.mae)}${unit} pour ${from}`
          : '';
      return `${to} a été plus juste ici que ${from} sur ${VARIABLE_WITH_ARTICLE[variable]} : ${formatOneDecimal(mae)}${unit} d’erreur moyenne à J+${leadDays}${versus}.`;
    }
    case 'shortSkill': {
      const { mae, bucket } = reason.toDetail ?? {};
      if (mae === undefined || bucket === undefined) {
        return `${to} a été plus proche des mesures de la station que ${from} à courte échéance.`;
      }
      const versus =
        reason.fromDetail?.mae === undefined
          ? ''
          : `, contre ${formatOneDecimal(reason.fromDetail.mae)}\u00a0°C pour ${from}`;
      return `${to} a été plus proche des mesures de la station que ${from} à ${bucket} d’échéance : ${formatOneDecimal(mae)}\u00a0°C d’erreur moyenne${versus}.`;
    }
  }
}

export interface SelectionExplanation {
  readonly headline: string;
  /** Criteres qui ont porte le choix, du plus lourd au plus leger. */
  readonly reasons: readonly string[];
  /** Criteres defavorables au modele retenu, dits franchement. */
  readonly caveats: readonly string[];
  readonly runnerUp: string | null;
}

/** Justification du modele retenu a l'instant present. */
export function explainSelection(
  ranking: readonly ModelRanking[],
  activeModel: ModelId | null,
  preferred: ModelId | null,
): SelectionExplanation {
  if (activeModel === null) {
    return {
      headline: 'Aucun modèle ne couvre cet instant.',
      reasons: [],
      caveats: [],
      runnerUp: null,
    };
  }
  const active = ranking.find((r) => r.model === activeModel);
  const label = MODEL_LABELS[activeModel];
  if (preferred !== null && preferred === activeModel) {
    const best = ranking.find((r) => r.eligible);
    const note =
      best !== undefined && best.model !== activeModel
        ? `La sélection automatique aurait retenu ${MODEL_LABELS[best.model]}.`
        : 'C’est aussi le choix de la sélection automatique.';
    return {
      headline: `${label}, choisi manuellement.`,
      reasons: [note],
      caveats: [],
      runnerUp: null,
    };
  }
  const criteria = active?.criteria ?? [];
  const sentences = (list: readonly Criterion[]) =>
    list
      .map((criterion) => criterionSentence(activeModel, criterion))
      .filter((sentence): sentence is string => sentence !== null);
  // Arguments du plus lourd au plus leger ; les criteres defavorables sont
  // gardes a part plutot que presentes comme des raisons du choix.
  const reasons = sentences(
    criteria.filter((c) => c.points > 0).sort((a, b) => b.points - a.points),
  );
  const caveats = sentences(criteria.filter((c) => c.points < 0));
  const eligible = ranking.filter((r) => r.eligible);
  const second = eligible.find((r) => r.model !== activeModel);
  const runnerUp =
    second === undefined || active === undefined
      ? null
      : `Suivant\u00a0: ${MODEL_LABELS[second.model]}, ${formatOneDecimal(second.score)}\u00a0points contre ${formatOneDecimal(active.score)}.`;
  const headline =
    preferred !== null
      ? `${label} retenu : ${MODEL_LABELS[preferred]}, votre choix, ne couvre pas cet instant.`
      : `${label} retenu pour ce lieu et cette échéance.`;
  return {
    headline,
    reasons: reasons.length > 0 ? reasons : ['Seul modèle disponible à cette échéance.'],
    caveats,
    runnerUp,
  };
}

/** Erreur de temperature a J+1 mesuree localement, ou null. */
export function localTemperatureError(
  verification: readonly ModelVerification[],
  model: ModelId,
): number | null {
  const entry = verification.find(
    (v) => v.model === model && v.variable === 'temperature' && v.leadDays === 1,
  );
  return entry?.stats?.mae ?? null;
}
