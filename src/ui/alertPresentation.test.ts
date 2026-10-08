import { describe, expect, it } from 'vitest';
import type { AlertHit } from '../domain/alerts';
import type { SpreadCrossing, SpreadHit } from '../domain/spreadAlerts';
import type { AlertRule } from '../domain/types';
import type { AirHit } from '../domain/airAlerts';
import type { ProbabilityHit } from '../domain/probabilityAlerts';
import {
  airHitSentence,
  alertUnit,
  hitSentence,
  probabilityHitSentence,
  ruleSentence,
  spreadHitSentence,
} from './alertPresentation';
import { toKmh } from './windUnit';

const gusts: AlertRule = {
  id: 'vent',
  placeId: 'lyon',
  variable: 'wind',
  comparator: 'gt',
  threshold: 60,
  enabled: true,
};

describe('ruleSentence', () => {
  it('dit la regle en une phrase, dans l unite choisie', () => {
    expect(ruleSentence(gusts, 'kmh')).toBe('Rafales au-dessus de 60\u00a0km/h');
    expect(ruleSentence(gusts, 'kt')).toBe('Rafales au-dessus de 32,4\u00a0kt');
    expect(
      ruleSentence({ ...gusts, variable: 'temperature', comparator: 'lt', threshold: -1.5 }, 'kmh'),
    ).toBe('Température sous -1,5\u00a0°C');
    expect(alertUnit('precipitation', 'kt')).toBe('mm');
  });
});

describe('ruleSentence, ecart entre modeles', () => {
  const spread: AlertRule = {
    ...gusts,
    id: 'ecart',
    kind: 'spread',
    variable: 'temperature',
    threshold: 3,
  };

  it('dit le desaccord surveille, dans l unite de la grandeur', () => {
    expect(ruleSentence(spread, 'kmh')).toBe(
      'Modèles en désaccord de plus de 3\u00a0°C sur la température',
    );
    expect(ruleSentence({ ...spread, variable: 'precipitation', threshold: 1.5 }, 'kmh')).toBe(
      'Modèles en désaccord de plus de 1,5\u00a0mm sur la pluie en une heure',
    );
    expect(ruleSentence({ ...spread, variable: 'wind', threshold: 40 }, 'kt')).toBe(
      'Modèles en désaccord de plus de 21,6\u00a0kt sur les rafales',
    );
  });
});

describe('spreadHitSentence', () => {
  const crossing = (time: string, spread: number): SpreadCrossing => ({
    time,
    variable: 'temperature',
    spread,
    modelCount: 4,
    high: { model: 'arome', value: 16 },
    low: { model: 'arpege', value: 10 },
  });
  const rule: AlertRule = {
    ...gusts,
    id: 'ecart',
    kind: 'spread',
    variable: 'temperature',
    threshold: 3,
  };
  const hit: SpreadHit = {
    rule,
    first: crossing('2026-09-29T06:00', 4),
    extreme: crossing('2026-09-29T07:00', 6),
    hours: 3,
  };

  it('dit quand, de combien et entre quels modeles', () => {
    expect(spreadHitSentence(hit, 'kmh')).toBe(
      'dès mardi 06h, jusqu’à 6\u00a0°C d’écart mardi 07h (AROME 16\u00a0°C, ARPEGE 10\u00a0°C), 3\u00a0h au total',
    );
  });

  it('abrege quand le seuil n est depasse qu une heure', () => {
    expect(spreadHitSentence({ ...hit, extreme: hit.first, hours: 1 }, 'kmh')).toBe(
      'dès mardi 06h, 4\u00a0°C d’écart (AROME 16\u00a0°C, ARPEGE 10\u00a0°C), une heure',
    );
  });
});

describe('hitSentence', () => {
  const hit: AlertHit = {
    rule: gusts,
    first: { time: '2026-09-29T06:00', value: 64, model: 'arpege' },
    extreme: { time: '2026-09-29T07:00', value: 71, model: 'arpege' },
    hours: 2,
  };

  it('dit quand, jusqu ou et selon quel modele', () => {
    expect(hitSentence(hit, 'kmh')).toBe(
      'dès mardi 06h, jusqu’à 71\u00a0km/h mardi 07h selon ARPEGE, 2\u00a0h au total',
    );
  });

  it('abrege quand le seuil n est franchi qu une heure', () => {
    expect(hitSentence({ ...hit, extreme: hit.first, hours: 1 }, 'kmh')).toBe(
      'dès mardi 06h, 64\u00a0km/h selon ARPEGE, une heure',
    );
  });
});

describe('toKmh', () => {
  it('ramene une saisie en noeuds vers les km/h du domaine', () => {
    expect(toKmh(10, 'kt')).toBeCloseTo(18.52, 5);
    expect(toKmh(10, 'kmh')).toBe(10);
  });
});

describe('regles et phrases d air, de pollens et d UV', () => {
  const uv: AlertRule = {
    id: 'uv',
    kind: 'air',
    placeId: 'lyon',
    variable: 'uv',
    comparator: 'gt',
    threshold: 7,
    enabled: true,
  };

  it('dit la regle avec son unite, ou sans unite pour un indice', () => {
    expect(ruleSentence(uv, 'kmh')).toBe('Indice UV au-dessus de 7');
    expect(ruleSentence({ ...uv, variable: 'aqi', threshold: 60 }, 'kmh')).toBe(
      'Indice européen de qualité de l’air au-dessus de 60',
    );
    expect(ruleSentence({ ...uv, variable: 'pm25', threshold: 25 }, 'kmh')).toBe(
      'Particules fines PM2,5 au-dessus de 25\u00a0µg/m³',
    );
    expect(ruleSentence({ ...uv, variable: 'pollen', threshold: 80 }, 'kmh')).toBe(
      'Pollens au-dessus de 80\u00a0grains/m³',
    );
  });

  it('dit quand, jusqu ou, la duree, le pollen en cause et la source CAMS', () => {
    const first = { time: '2026-09-29T11:00' as const, value: 90, pollen: 'grass' };
    const extreme = { time: '2026-09-29T13:00' as const, value: 150, pollen: 'birch' };
    const hit: AirHit = {
      rule: { ...uv, variable: 'pollen', threshold: 80 },
      first,
      extreme,
      hours: 3,
    };
    expect(airHitSentence(hit)).toBe(
      'dès mardi 11h, jusqu’à 150\u00a0grains/m³ mardi 13h (bouleau), 3\u00a0h au total, prévision CAMS Europe',
    );
    expect(airHitSentence({ ...hit, extreme: first, hours: 1 })).toBe(
      'dès mardi 11h, 90\u00a0grains/m³ (graminées), une heure, prévision CAMS Europe',
    );
    const uvPeak = { time: '2026-09-29T12:00' as const, value: 8, pollen: null };
    expect(airHitSentence({ rule: uv, first: uvPeak, extreme: uvPeak, hours: 1 })).toBe(
      'dès mardi 12h, 8, une heure, prévision CAMS Europe',
    );
  });

  it('garde le nom d un pollen inconnu tel quel', () => {
    const peak = { time: '2026-09-29T12:00' as const, value: 90, pollen: 'cypres' };
    expect(
      airHitSentence({
        rule: { ...uv, variable: 'pollen' },
        first: peak,
        extreme: peak,
        hours: 1,
      }),
    ).toContain('(cypres)');
  });
});

describe('alerte en probabilite', () => {
  const frostRule: AlertRule = {
    id: 'proba',
    placeId: 'lyon',
    variable: 'temperature',
    comparator: 'lt',
    threshold: 0,
    enabled: true,
    kind: 'probability',
    probability: 40,
  };

  it('dit la regle avec le pourcentage de scenarios, dans l unite choisie', () => {
    expect(ruleSentence(frostRule, 'kmh')).toBe(
      'Température sous 0\u00a0°C pour au moins 40\u00a0% des scénarios de l’ensemble',
    );
    expect(
      ruleSentence(
        { ...frostRule, variable: 'wind', comparator: 'gt', threshold: 60, probability: 25 },
        'kt',
      ),
    ).toBe('Rafales au-dessus de 32,4\u00a0kt pour au moins 25\u00a0% des scénarios de l’ensemble');
  });

  const hit: ProbabilityHit = {
    rule: frostRule,
    first: { time: '2026-09-29T04:00', share: 0.41 },
    peak: { time: '2026-09-29T06:00', share: 0.62 },
    hours: 3,
    anyTime: 0.82,
    memberCount: 51,
  };

  it('dit quand, la part des scenarios, le pic, la duree et la part sur tout l horizon', () => {
    expect(probabilityHitSentence(hit)).toBe(
      'dès mardi 04h, jusqu’à 62\u00a0% des 51 scénarios de l’ensemble ECMWF mardi 06h, 3\u00a0h au total, et 82\u00a0% des scénarios au moins une fois sur 72\u00a0h',
    );
  });

  it('abrege quand le pic est la premiere heure, et dit une heure seule', () => {
    expect(
      probabilityHitSentence({
        ...hit,
        peak: { time: hit.first.time, share: 0.41 },
        hours: 1,
        anyTime: 0.41,
      }),
    ).toBe(
      'dès mardi 04h, 41\u00a0% des 51 scénarios de l’ensemble ECMWF, une heure, et 41\u00a0% des scénarios au moins une fois sur 72\u00a0h',
    );
  });
});
