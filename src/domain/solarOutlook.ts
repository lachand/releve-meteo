import type { AlertPoint } from './alerts';
import { localIsoFromUtc } from './time';
import type { LocalIsoHour, ModelId } from './types';

/*
 * Production solaire estimee (Lot 8), sur aujourd'hui et demain. C'est une
 * estimation : le rayonnement prevu, converti par la puissance crete saisie,
 * avec une perte systeme forfaitaire ; ni l'orientation, ni l'inclinaison, ni
 * les masques, ni la temperature des panneaux ne sont connus. Une heure sans
 * rayonnement rend la production du jour inconnue, jamais nulle.
 */

export const SOLAR = {
  /** Pertes forfaitaires (onduleur, cables, salissures, temperature), part de la puissance. */
  systemLoss: 0.2,
  /** Rayonnement des conditions de test standard, W/m2. */
  standardTestWm2: 1000,
  /** Une heure est « de forte production » au-dela de cette part de la puissance crete. */
  strongShare: 0.4,
  /** Heures de forte production pour qu'une journee soit dite favorable au surplus. */
  minStrongHours: 4,
  /** Jours couverts. */
  days: 2,
} as const;

export interface SolarHour {
  readonly time: LocalIsoHour;
  /** Puissance estimee, kW ; null quand le rayonnement manque. */
  readonly kw: number | null;
}

export interface SolarDay {
  readonly date: string;
  /** Production estimee de la journee, kWh ; null si une heure manque. */
  readonly kwh: number | null;
  /** Puissance estimee la plus haute, kW ; null si une heure manque. */
  readonly peakKw: number | null;
  /** Heures au-dela de SOLAR.strongShare de la puissance crete ; null si une heure manque. */
  readonly strongHours: number | null;
  /** Au moins SOLAR.minStrongHours heures de forte production ; null si indetermine. */
  readonly favourable: boolean | null;
}

export interface SolarOutlook {
  /** Les 48 heures d'aujourd'hui et de demain, de minuit a minuit. */
  readonly hours: readonly SolarHour[];
  readonly days: readonly SolarDay[];
  /** Modeles qui fournissent le rayonnement de ces heures, dans l'ordre. */
  readonly models: readonly ModelId[];
}

/** Production estimee, en kW, pour un rayonnement donne. */
function powerKw(radiationWm2: number, peakKwp: number): number {
  return (radiationWm2 / SOLAR.standardTestWm2) * peakKwp * (1 - SOLAR.systemLoss);
}

function dateAfter(date: string, offset: number): string {
  const [year, month, day] = [
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  ];
  // Midi UTC : le meme jour calendaire a Paris, quelle que soit l'heure d'ete.
  return localIsoFromUtc(Date.UTC(year, month - 1, day + offset, 12)).slice(0, 10);
}

/** Estimation solaire d'aujourd'hui et de demain, ou null sans puissance crete ni point du jour. */
export function solarOutlook(input: {
  readonly points: readonly AlertPoint[];
  readonly peakKwp: number | null;
  readonly now: Date;
}): SolarOutlook | null {
  const { peakKwp } = input;
  if (peakKwp === null || !(peakKwp > 0)) {
    return null;
  }
  const today = localIsoFromUtc(input.now.getTime()).slice(0, 10);
  const dates = Array.from({ length: SOLAR.days }, (_, offset) => dateAfter(today, offset));
  const covered = input.points.filter((point) => dates.includes(point.time.slice(0, 10)));
  if (covered.length === 0) {
    return null;
  }

  const hours: SolarHour[] = covered.map((point) => {
    const radiation = point.radiation.value;
    return { time: point.time, kw: radiation === null ? null : powerKw(radiation, peakKwp) };
  });

  const days = dates.flatMap((date): SolarDay[] => {
    const own = hours.filter((hour) => hour.time.startsWith(date));
    if (own.length === 0) {
      return [];
    }
    const known = own.map((hour) => hour.kw);
    if (known.some((kw) => kw === null)) {
      return [{ date, kwh: null, peakKw: null, strongHours: null, favourable: null }];
    }
    const values = known as number[];
    const strongHours = values.filter((kw) => kw > peakKwp * SOLAR.strongShare).length;
    return [
      {
        date,
        // Chaque heure tient une heure : des kW par heure sont des kWh.
        kwh: values.reduce((sum, kw) => sum + kw, 0),
        peakKw: Math.max(...values),
        strongHours,
        favourable: strongHours >= SOLAR.minStrongHours,
      },
    ];
  });

  const models = covered.reduce<ModelId[]>((list, point) => {
    const model = point.filledFrom?.radiation ?? point.model;
    return list.includes(model) ? list : [...list, model];
  }, []);

  return { hours, days, models };
}
