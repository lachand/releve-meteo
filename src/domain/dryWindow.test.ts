import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import type { AlertPoint } from './alerts';
import { DRY_WINDOW, bestDryWindow } from './dryWindow';
import type { LocalIsoHour, ModelId } from './types';

// Lundi 28 septembre 2026, 10 h 12 locales (8 h 12 UTC en heure d'ete).
const NOW = new Date('2026-09-28T08:12:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 48);

interface Hour {
  readonly rain?: number | null;
  readonly gust?: number | null;
  readonly isDay?: boolean | null;
  readonly model?: ModelId;
}

/** Points de la timeline ; `hour(h)` surcharge l'heure locale h du 28 (defaut : sec, calme, jour de 7 h a 20 h). */
function points(hour: (h: number) => Hour = () => ({})): AlertPoint[] {
  return TIMELINE.map((time, index) => {
    const h = index % 24;
    const day = h >= 7 && h < 20;
    const over = hour(index);
    return {
      ...hourlyPoint(time as LocalIsoHour, {
        precipitation: 'rain' in over ? (over.rain ?? null) : 0,
        windGust: 'gust' in over ? (over.gust ?? null) : 15,
        isDay: 'isDay' in over ? (over.isDay ?? null) : day,
      }),
      model: over.model ?? 'arome',
    };
  });
}

describe('bestDryWindow', () => {
  it('rend toute la journee quand rien ne mouille ni ne souffle', () => {
    const result = bestDryWindow({ points: points(), now: NOW });
    expect(result).toEqual({
      status: 'all-day',
      start: '2026-09-28T10:00',
      end: '2026-09-28T20:00',
      hours: 10,
      models: ['arome'],
    });
  });

  it('choisit la plus longue fenetre entre deux averses', () => {
    const result = bestDryWindow({
      points: points((i) => ({ rain: i === 12 || i === 13 || i === 18 ? 1.2 : 0 })),
      now: NOW,
    });
    // Sec de 10 h a 12 h (2 h), de 14 h a 18 h (4 h), puis 19 h (1 h).
    expect(result).toMatchObject({ status: 'window', start: '2026-09-28T14:00', hours: 4 });
    expect(result).toMatchObject({ end: '2026-09-28T18:00' });
  });

  it('prend la plus precoce a longueur egale', () => {
    const result = bestDryWindow({
      points: points((i) => ({ rain: i === 13 ? 1 : 0 })),
      now: NOW,
    });
    // 10 h a 13 h (3 h) et 14 h a 20 h (6 h) : la seconde est plus longue ;
    // on force l'egalite ci-dessous.
    expect(result).toMatchObject({ start: '2026-09-28T14:00', hours: 6 });
    const tie = bestDryWindow({
      points: points((i) => ({ rain: i >= 13 && i < 17 ? 1 : 0 })),
      now: NOW,
    });
    // 10 h a 13 h (3 h) et 17 h a 20 h (3 h).
    expect(tie).toMatchObject({ start: '2026-09-28T10:00', hours: 3 });
  });

  it('ecarte les heures trop ventees, pas seulement les heures mouillees', () => {
    const result = bestDryWindow({
      points: points((i) => ({ gust: i >= 12 && i < 15 ? DRY_WINDOW.gustKmh + 1 : 15 })),
      now: NOW,
    });
    expect(result).toMatchObject({ status: 'window', start: '2026-09-28T15:00', hours: 5 });
  });

  it('exige DRY_WINDOW.minHours heures d affilee', () => {
    const none = bestDryWindow({
      points: points((i) => ({ rain: i % 2 === 0 ? 1 : 0 })),
      now: NOW,
    });
    expect(none).toEqual({ status: 'none', reason: 'wet-or-windy' });
  });

  it('ne compte jamais une heure sans donnee comme seche : elle coupe la fenetre', () => {
    const result = bestDryWindow({
      points: points((i) => ({ rain: i === 14 ? null : 0, gust: i === 16 ? null : 15 })),
      now: NOW,
    });
    // 10 h a 14 h (4 h), 15 h (1 h), 17 h a 20 h (3 h).
    expect(result).toMatchObject({ status: 'window', start: '2026-09-28T10:00', hours: 4 });
  });

  it('ne cherche que dans les heures de jour', () => {
    const result = bestDryWindow({ points: points(), now: new Date('2026-09-28T17:30:00Z') });
    // 19 h 30 locale : une seule heure de jour restante, trop courte.
    expect(result).toEqual({ status: 'none', reason: 'wet-or-windy' });
  });

  it('nomme les modeles qui fournissent les heures de la fenetre, dans l ordre', () => {
    const result = bestDryWindow({
      points: points((i) => ({ model: i < 15 ? 'arome' : 'icon_eu' })),
      now: NOW,
    });
    expect(result).toMatchObject({ status: 'all-day', models: ['arome', 'icon_eu'] });
  });

  it('prefere le modele qui a complete la pluie a celui du point', () => {
    const base = points();
    const filled = base.map((point, i) =>
      i >= 10 && i < 20
        ? { ...point, model: 'arome' as const, filledFrom: { precipitation: 'gfs' as const } }
        : point,
    );
    const result = bestDryWindow({ points: filled, now: NOW });
    expect(result).toMatchObject({ status: 'all-day', models: ['gfs'] });
  });

  it('ne rend rien sans point a venir ni heure de jour connue', () => {
    expect(bestDryWindow({ points: [], now: NOW })).toEqual({ status: 'none', reason: 'night' });
    expect(bestDryWindow({ points: points(() => ({ isDay: null })), now: NOW })).toEqual({
      status: 'none',
      reason: 'night',
    });
    // 21 h 30 locale : plus d'heure de jour aujourd'hui.
    expect(bestDryWindow({ points: points(), now: new Date('2026-09-28T19:30:00Z') })).toEqual({
      status: 'none',
      reason: 'night',
    });
  });
});
