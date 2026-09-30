import type { MountainOutlook } from '../domain/mountainOutlook';
import { MOUNTAIN } from '../domain/mountainOutlook';
import type { TerrainKind } from '../domain/types';
import { formatCompact, formatDayHour, formatInteger } from './format';
import { MODEL_LABELS } from './modelLabels';

/* Phrases de la vue montagne : l'isotherme 0 °C et la neige, avec le modele. */

/** A partir de cette altitude, la section « Neige et isotherme » est montree meme sans neige. */
const HIGH_PLACE_M = 800;

/** Espace fine insecable des milliers : « 2 050 ». */
function metres(value: number): string {
  return `${formatInteger(value).replace(/\s/g, '\u202f')}\u00a0m`;
}

function by(models: readonly (keyof typeof MODEL_LABELS)[]): string {
  return `selon ${models.map((model) => MODEL_LABELS[model]).join(', puis ')}`;
}

export function freezingSentence(outlook: MountainOutlook): string {
  const { freezingNow, relativeNow, freezingMin, freezingMax, freezingModel } = outlook;
  if (freezingNow === null || relativeNow === null || freezingModel === null) {
    return 'Isotherme 0\u00a0°C : pas de valeur des modèles.';
  }
  const place =
    relativeNow >= 0
      ? `${metres(relativeNow)} au-dessus de vous`
      : `${metres(-relativeNow)} sous vous : la neige peut descendre jusqu’ici`;
  const range =
    freezingMin === null || freezingMax === null
      ? ''
      : ` Sur ${MOUNTAIN.freezingHours} h, entre ${metres(freezingMin)} et ${metres(freezingMax)}.`;
  return `L’isotherme 0\u00a0°C est à ${metres(freezingNow)}, ${place} (${by([freezingModel])}).${range}`;
}

export function snowSentence(outlook: MountainOutlook): string {
  const { snowCm, snowHours, firstSnow, snowModels } = outlook;
  if (snowCm === null) {
    return 'Neige : pas de valeur des modèles.';
  }
  if (snowCm === 0 || firstSnow === null) {
    return `Pas de neige annoncée sur ${MOUNTAIN.snowHours} h.`;
  }
  const hours = snowHours === 1 ? '1 heure' : `${snowHours} heures`;
  return `Neige : ${formatCompact(Math.round(snowCm * 10) / 10)}\u00a0cm sur ${MOUNTAIN.snowHours} h, en ${hours}, dès ${formatDayHour(firstSnow)} (${by(snowModels)}).`;
}

/** La section est utile en montagne, en altitude, ou des qu'il neige ; jamais sans vue. */
export function shouldShowMountain(input: {
  readonly kind: TerrainKind | null;
  readonly elevation: number;
  readonly outlook: MountainOutlook | null;
}): boolean {
  if (input.outlook === null || input.kind === null) {
    return false;
  }
  return (
    input.kind === 'mountain' || input.elevation >= HIGH_PLACE_M || (input.outlook.snowCm ?? 0) > 0
  );
}
