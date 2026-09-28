/*
 * Vigilance meteorologique officielle de Meteo-France, par departement :
 * un niveau (vert, jaune, orange, rouge) par phenomene, pour aujourd'hui
 * (J) et demain (J1), avec sa chronologie. C'est un produit expertise par
 * des previsionnistes, pas une sortie de modele : l'interface le presente
 * comme tel, distinct des « phenomenes a surveiller » calcules par Relevé.
 */

/** 1 vert, 2 jaune, 3 orange, 4 rouge. */
export type VigilanceLevel = 1 | 2 | 3 | 4;

export type VigilancePhenomenon =
  'wind' | 'rain' | 'thunderstorm' | 'flood' | 'snowIce' | 'heat' | 'cold' | 'avalanche' | 'waves';

/** Identifiants de phenomene de la vigilance Meteo-France. */
export const VIGILANCE_PHENOMENA: Readonly<Record<number, VigilancePhenomenon>> = {
  1: 'wind',
  2: 'rain',
  3: 'thunderstorm',
  4: 'flood',
  5: 'snowIce',
  6: 'heat',
  7: 'cold',
  8: 'avalanche',
  9: 'waves',
};

export interface VigilancePeriod {
  readonly phenomenon: VigilancePhenomenon;
  readonly level: VigilanceLevel;
  readonly beginUtcMs: number;
  readonly endUtcMs: number;
  /** Domaine littoral du departement (vagues-submersion). */
  readonly coastal: boolean;
}

export interface VigilanceBulletin {
  /** Code INSEE du departement. */
  readonly department: string;
  /** Heure d'emission du bulletin, epoch ms. */
  readonly issuedUtcMs: number;
  readonly periods: readonly VigilancePeriod[];
}

export interface VigilanceWarning {
  readonly phenomenon: VigilancePhenomenon;
  readonly level: VigilanceLevel;
  readonly beginUtcMs: number;
  readonly endUtcMs: number;
  readonly coastal: boolean;
}

export interface VigilanceSummary {
  /** Niveau le plus eleve encore a venir ; 1 si tout est vert. */
  readonly maxLevel: VigilanceLevel;
  /** Vigilances jaunes a rouges pas encore terminees, les plus fortes d'abord. */
  readonly warnings: readonly VigilanceWarning[];
  /** Bulletin emis il y a plus de BULLETIN_STALE_HOURS. */
  readonly stale: boolean;
}

/** Un bulletin est renouvele au moins deux fois par jour. */
export const BULLETIN_STALE_HOURS = 30;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Synthese a `now` : les periodes deja terminees sont ecartees ; les
 * periodes contigues d'un meme phenomene au meme niveau (fin d'aujourd'hui,
 * debut de demain) sont fusionnees.
 */
export function summarizeVigilance(bulletin: VigilanceBulletin, now: Date): VigilanceSummary {
  const nowMs = now.getTime();
  const remaining = bulletin.periods
    .filter((period) => period.endUtcMs > nowMs)
    .sort((a, b) => a.beginUtcMs - b.beginUtcMs);

  const merged: VigilanceWarning[] = [];
  for (const period of remaining) {
    if (period.level < 2) {
      continue;
    }
    const previous = merged.find(
      (warning) =>
        warning.phenomenon === period.phenomenon &&
        warning.level === period.level &&
        warning.coastal === period.coastal &&
        warning.endUtcMs === period.beginUtcMs,
    );
    if (previous === undefined) {
      merged.push({ ...period });
    } else {
      merged[merged.indexOf(previous)] = { ...previous, endUtcMs: period.endUtcMs };
    }
  }

  const maxLevel = remaining.reduce<VigilanceLevel>(
    (max, period) => (period.level > max ? period.level : max),
    1,
  );
  return {
    maxLevel,
    warnings: merged.sort((a, b) => b.level - a.level || a.beginUtcMs - b.beginUtcMs),
    stale: nowMs - bulletin.issuedUtcMs > BULLETIN_STALE_HOURS * HOUR_MS,
  };
}
