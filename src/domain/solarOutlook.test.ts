import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import type { AlertPoint } from './alerts';
import { SOLAR, solarOutlook } from './solarOutlook';
import type { LocalIsoHour, ModelId } from './types';

// Lundi 28 septembre 2026, 10 h 12 locales.
const NOW = new Date('2026-09-28T08:12:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 72);

interface Hour {
  readonly radiation?: number | null;
  readonly model?: ModelId;
}

/** 72 h du 28 au 30 ; `hour(i)` surcharge le rayonnement de l'heure i (defaut : 0 W/m2). */
function points(hour: (i: number) => Hour = () => ({})): AlertPoint[] {
  return TIMELINE.map((time, i) => {
    const over = hour(i);
    return {
      ...hourlyPoint(time as LocalIsoHour, {
        radiation: 'radiation' in over ? (over.radiation ?? null) : 0,
      }),
      model: over.model ?? 'arome',
    };
  });
}

/** Journee en cloche : 600 W/m2 de 10 h a 15 h, 300 W/m2 a 9 h et a 16 h. */
function bell(i: number): Hour {
  const h = i % 24;
  if (h >= 10 && h <= 15) return { radiation: 600 };
  if (h === 9 || h === 16) return { radiation: 300 };
  return { radiation: 0 };
}

describe('solarOutlook', () => {
  it('convertit chaque heure en kW : rayonnement / 1000 x puissance crete x (1 moins les pertes)', () => {
    const outlook = solarOutlook({ points: points(bell), peakKwp: 5, now: NOW });
    const noon = outlook?.hours.find((h) => h.time === '2026-09-28T12:00');
    expect(noon?.kw).toBeCloseTo((600 / 1000) * 5 * (1 - SOLAR.systemLoss));
    expect(outlook?.hours.find((h) => h.time === '2026-09-28T03:00')?.kw).toBe(0);
  });

  it('couvre 48 heures a partir de minuit aujourd hui, pas le passe d hier ni le troisieme jour', () => {
    const outlook = solarOutlook({ points: points(bell), peakKwp: 5, now: NOW });
    expect(outlook?.hours).toHaveLength(48);
    expect(outlook?.hours[0]?.time).toBe('2026-09-28T00:00');
    expect(outlook?.hours.at(-1)?.time).toBe('2026-09-29T23:00');
    expect(outlook?.days.map((d) => d.date)).toEqual(['2026-09-28', '2026-09-29']);
  });

  it('additionne la production de la journee en kWh et compte les heures de forte production', () => {
    const outlook = solarOutlook({ points: points(bell), peakKwp: 5, now: NOW });
    const day = outlook?.days[0];
    // 6 h a 600 W/m2 et 2 h a 300 W/m2, en kWh : (6 x 600 + 2 x 300) / 1000 x 5 x 0,8.
    expect(day?.kwh).toBeCloseTo(((6 * 600 + 2 * 300) / 1000) * 5 * (1 - SOLAR.systemLoss));
    // Seuil : 40 % de la puissance crete = 2 kW ; 600 W/m2 donne 2,4 kW, 300 W/m2 donne 1,2 kW.
    expect(day?.strongHours).toBe(6);
    expect(day?.favourable).toBe(true);
    expect(day?.peakKw).toBeCloseTo(2.4);
  });

  it('ne juge pas favorable une journee couverte', () => {
    const outlook = solarOutlook({
      points: points((i) => ({ radiation: i % 24 >= 10 && i % 24 <= 15 ? 120 : 0 })),
      peakKwp: 5,
      now: NOW,
    });
    expect(outlook?.days[0]).toMatchObject({ strongHours: 0, favourable: false });
    expect(outlook?.days[0]?.kwh).toBeGreaterThan(0);
  });

  it('le seuil d heures de forte production est inclusif', () => {
    const build = (hours: number) =>
      solarOutlook({
        points: points((i) => ({
          radiation: i < 24 && i >= 10 && i < 10 + hours ? 600 : 0,
        })),
        peakKwp: 5,
        now: NOW,
      })?.days[0]?.favourable;
    expect(build(SOLAR.minStrongHours)).toBe(true);
    expect(build(SOLAR.minStrongHours - 1)).toBe(false);
  });

  it('une heure sans rayonnement rend la production du jour inconnue, jamais nulle', () => {
    const outlook = solarOutlook({
      points: points((i) => (i === 12 ? { radiation: null } : bell(i))),
      peakKwp: 5,
      now: NOW,
    });
    expect(outlook?.hours.find((h) => h.time === '2026-09-28T12:00')?.kw).toBeNull();
    expect(outlook?.days[0]).toMatchObject({ kwh: null, favourable: null, strongHours: null });
    // L'autre jour reste calculable.
    expect(outlook?.days[1]?.kwh).not.toBeNull();
  });

  it('nomme les modeles qui fournissent le rayonnement, dans l ordre', () => {
    const outlook = solarOutlook({
      points: points((i) => ({ ...bell(i), model: i < 30 ? 'arome' : 'icon_eu' })),
      peakKwp: 5,
      now: NOW,
    });
    expect(outlook?.models).toEqual(['arome', 'icon_eu']);
  });

  it('nomme le modele qui a complete le rayonnement plutot que celui du point', () => {
    const filled = points(bell).map((point, i) =>
      i < 48 ? { ...point, filledFrom: { radiation: 'gfs' as const } } : point,
    );
    expect(solarOutlook({ points: filled, peakKwp: 5, now: NOW })?.models).toEqual(['gfs']);
  });

  it('ne cree pas de jour sans aucun point : demain absent de la prevision, seul aujourd hui est rendu', () => {
    const outlook = solarOutlook({ points: points(bell).slice(0, 24), peakKwp: 5, now: NOW });
    expect(outlook?.days.map((d) => d.date)).toEqual(['2026-09-28']);
    expect(outlook?.hours).toHaveLength(24);
  });

  it('rend null sans puissance crete valide ou sans aucun point du jour', () => {
    expect(solarOutlook({ points: points(bell), peakKwp: null, now: NOW })).toBeNull();
    expect(solarOutlook({ points: points(bell), peakKwp: 0, now: NOW })).toBeNull();
    expect(solarOutlook({ points: [], peakKwp: 5, now: NOW })).toBeNull();
  });
});
