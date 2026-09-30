import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import type { AlertPoint } from './alerts';
import { mountainOutlook } from './mountainOutlook';
import type { ModelId } from './types';

// Lundi 28 septembre 2026, 10 h 12 locales.
const NOW = new Date('2026-09-28T08:12:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 120);

interface Hour {
  readonly freezing?: number | null;
  readonly snow?: number | null;
  readonly model?: ModelId;
  readonly filled?: { freezingLevel?: ModelId; snowfall?: ModelId };
}

function points(hour: (index: number) => Hour = () => ({})): AlertPoint[] {
  return TIMELINE.map((time, index) => {
    const over = hour(index);
    return {
      ...hourlyPoint(time, {
        freezingLevel: 'freezing' in over ? (over.freezing ?? null) : 2000,
        snowfall: 'snow' in over ? (over.snow ?? null) : 0,
      }),
      model: over.model ?? 'arome',
      ...(over.filled === undefined ? {} : { filledFrom: over.filled }),
    };
  });
}

describe('mountainOutlook', () => {
  it('donne l iso 0 °C du moment, sa hauteur par rapport au lieu, et ses extremes sur 48 h', () => {
    const outlook = mountainOutlook({
      points: points((i) => ({ freezing: 1800 + (i % 24) * 25 })),
      now: NOW,
      elevation: 1500,
    });
    // Premier point retenu : 10 h (index 10) -> 1800 + 10 * 25.
    expect(outlook?.freezingNow).toBe(2050);
    expect(outlook?.relativeNow).toBe(550);
    expect(outlook?.freezingMin).toBe(1800);
    expect(outlook?.freezingMax).toBe(2375);
  });

  it('additionne la neige sur 72 h et date la premiere heure de neige', () => {
    const outlook = mountainOutlook({
      points: points((i) => ({ snow: i === 14 || i === 15 ? 1.5 : i === 40 ? 0.4 : 0 })),
      now: NOW,
      elevation: 1200,
    });
    expect(outlook?.snowCm).toBeCloseTo(3.4);
    expect(outlook?.snowHours).toBe(3);
    expect(outlook?.firstSnow).toBe('2026-09-28T14:00');
  });

  it('ignore la neige au-dela de l horizon de 72 h', () => {
    const outlook = mountainOutlook({
      points: points((i) => ({ snow: i >= 10 + 73 ? 5 : 0 })),
      now: NOW,
      elevation: 1200,
    });
    expect(outlook?.snowCm).toBe(0);
    expect(outlook?.snowHours).toBe(0);
    expect(outlook?.firstSnow).toBeNull();
  });

  it('dit null, jamais 0 cm, quand aucune heure ne donne de neige', () => {
    const outlook = mountainOutlook({
      points: points(() => ({ snow: null })),
      now: NOW,
      elevation: 1200,
    });
    expect(outlook?.snowCm).toBeNull();
    expect(outlook?.snowHours).toBe(0);
  });

  it('ne dit rien de l iso 0 °C sans valeur, ni de sa position sans altitude connue', () => {
    const noFreezing = mountainOutlook({
      points: points(() => ({ freezing: null })),
      now: NOW,
      elevation: 1200,
    });
    expect(noFreezing).toMatchObject({
      freezingNow: null,
      relativeNow: null,
      freezingMin: null,
      freezingMax: null,
      freezingModel: null,
    });
  });

  it('nomme le modele de l iso 0 °C (complement compris) et ceux de la neige', () => {
    const outlook = mountainOutlook({
      points: points((i) => ({
        snow: i === 14 ? 1 : i === 16 ? 2 : 0,
        model: i >= 16 ? 'icon_eu' : 'arome',
        filled: i === 10 ? { freezingLevel: 'gfs' } : undefined,
      })),
      now: NOW,
      elevation: 1200,
    });
    expect(outlook?.freezingModel).toBe('gfs');
    expect(outlook?.snowModels).toEqual(['arome', 'icon_eu']);
  });

  it('ne rend rien sans point a venir', () => {
    expect(mountainOutlook({ points: [], now: NOW, elevation: 1200 })).toBeNull();
  });
});
