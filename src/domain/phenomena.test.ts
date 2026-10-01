import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import type { HourlyValues } from '../../tests/factories';
import { detectPhenomena, thunderRiskOf, worstLevelByKind } from './phenomena';
import type { PhenomenonKind, RiskLevel } from './phenomena';
import type { HourlyPoint, ModelId } from './types';

const CALM: HourlyValues = {
  temperature: 15,
  dewPoint: 8,
  windSpeed: 10,
  windGust: 20,
  precipitation: 0,
  snowfall: 0,
  cape: 0,
  visibility: 20000,
  weatherCode: 1,
};

function series(
  hours: readonly HourlyValues[],
  model?: ModelId,
): (HourlyPoint & { readonly model?: ModelId })[] {
  const timeline = buildHourlyTimeline('2026-08-17T00:00', hours.length);
  return hours.map((values, i) => {
    const point = hourlyPoint(timeline[i] ?? '', { ...CALM, ...values });
    return model === undefined ? point : { ...point, model };
  });
}

/** Niveau detecte pour un phenomene sur une heure isolee, ou null. */
function levelFor(kind: PhenomenonKind, values: HourlyValues): RiskLevel | null {
  const episode = detectPhenomena(series([values])).find((e) => e.kind === kind);
  return episode?.level ?? null;
}

describe('orage', () => {
  it('se fie au code de temps orageux, modere sans CAPE forte', () => {
    expect(levelFor('thunderstorm', { weatherCode: 95, cape: null })).toBe('moderate');
    expect(levelFor('thunderstorm', { weatherCode: 95, cape: 300 })).toBe('moderate');
    expect(levelFor('thunderstorm', { weatherCode: 95, cape: 2500 })).toBe('high');
    expect(levelFor('thunderstorm', { weatherCode: 96 })).toBe('high');
  });

  it('gradue la CAPE quand il pleut', () => {
    expect(levelFor('thunderstorm', { cape: 2200, precipitation: 1 })).toBe('high');
    expect(levelFor('thunderstorm', { cape: 1200, precipitation: 1 })).toBe('moderate');
    expect(levelFor('thunderstorm', { cape: 600, precipitation: 1 })).toBe('low');
    expect(levelFor('thunderstorm', { cape: 300, precipitation: 1 })).toBeNull();
  });

  it('ignore la CAPE sans pluie, ou une donnee absente', () => {
    expect(levelFor('thunderstorm', { cape: 2500, precipitation: 0.1 })).toBeNull();
    expect(levelFor('thunderstorm', { cape: null, precipitation: 3 })).toBeNull();
    expect(levelFor('thunderstorm', { cape: 2500, precipitation: null })).toBeNull();
    expect(levelFor('thunderstorm', { weatherCode: null, cape: 0 })).toBeNull();
  });
});

describe('forte pluie', () => {
  it('suit les seuils horaires', () => {
    expect(levelFor('heavyRain', { precipitation: 8 })).toBe('high');
    expect(levelFor('heavyRain', { precipitation: 5 })).toBe('moderate');
    expect(levelFor('heavyRain', { precipitation: 1 })).toBeNull();
    expect(levelFor('heavyRain', { precipitation: null })).toBeNull();
  });
});

describe('neige', () => {
  it('gradue le cumul horaire et reconnait le code de neige', () => {
    expect(levelFor('snow', { snowfall: 4 })).toBe('high');
    expect(levelFor('snow', { snowfall: 1.5 })).toBe('moderate');
    expect(levelFor('snow', { snowfall: 0.2 })).toBe('low');
    expect(levelFor('snow', { snowfall: null, weatherCode: 73 })).toBe('low');
    expect(levelFor('snow', { snowfall: null, weatherCode: null })).toBeNull();
    expect(levelFor('snow', { snowfall: 0, weatherCode: 61 })).toBeNull();
  });
});

describe('pluie verglacante', () => {
  it('reconnait les codes verglacants et la pluie par temperature negative', () => {
    expect(levelFor('freezingRain', { weatherCode: 67 })).toBe('high');
    expect(levelFor('freezingRain', { temperature: -1, precipitation: 0.5, snowfall: 0 })).toBe(
      'moderate',
    );
  });

  it('ne conclut pas sans certitude sur la nature des precipitations', () => {
    expect(
      levelFor('freezingRain', { temperature: -1, precipitation: 0.5, snowfall: null }),
    ).toBeNull();
    expect(
      levelFor('freezingRain', { temperature: -1, precipitation: 0.5, snowfall: 0.4 }),
    ).toBeNull();
    expect(levelFor('freezingRain', { temperature: 2, precipitation: 0.5 })).toBeNull();
    expect(levelFor('freezingRain', { temperature: -1, precipitation: 0.1 })).toBeNull();
    expect(levelFor('freezingRain', { temperature: null, precipitation: 1 })).toBeNull();
    expect(levelFor('freezingRain', { temperature: -1, precipitation: null })).toBeNull();
  });
});

describe('gel', () => {
  it('suit les seuils de temperature', () => {
    expect(levelFor('frost', { temperature: -6 })).toBe('high');
    expect(levelFor('frost', { temperature: 0 })).toBe('moderate');
    expect(levelFor('frost', { temperature: 1.5 })).toBe('low');
    expect(levelFor('frost', { temperature: 2 })).toBeNull();
    expect(levelFor('frost', { temperature: null })).toBeNull();
  });
});

describe('brouillard', () => {
  it('se fie a la visibilite, puis au code, puis a l ecart temperature / rosee', () => {
    expect(levelFor('fog', { visibility: 150 })).toBe('high');
    expect(levelFor('fog', { visibility: 800 })).toBe('moderate');
    expect(levelFor('fog', { visibility: 5000, weatherCode: 45 })).toBe('moderate');
    expect(levelFor('fog', { visibility: null, temperature: 5, dewPoint: 4.5, windSpeed: 3 })).toBe(
      'low',
    );
  });

  it('ne signale rien sans indice', () => {
    expect(levelFor('fog', { visibility: 5000 })).toBeNull();
    expect(
      levelFor('fog', { visibility: null, temperature: 5, dewPoint: 2, windSpeed: 3 }),
    ).toBeNull();
    expect(
      levelFor('fog', { visibility: null, temperature: 5, dewPoint: 4.5, windSpeed: 12 }),
    ).toBeNull();
    expect(levelFor('fog', { visibility: null, temperature: null, weatherCode: null })).toBeNull();
    expect(
      levelFor('fog', { visibility: null, temperature: 5, dewPoint: null, weatherCode: null }),
    ).toBeNull();
    expect(
      levelFor('fog', { visibility: null, temperature: 5, dewPoint: 4.8, windSpeed: null }),
    ).toBeNull();
  });
});

describe('vent fort', () => {
  it('suit les seuils de rafale', () => {
    expect(levelFor('strongWind', { windGust: 110 })).toBe('high');
    expect(levelFor('strongWind', { windGust: 85 })).toBe('moderate');
    expect(levelFor('strongWind', { windGust: 65 })).toBe('low');
    expect(levelFor('strongWind', { windGust: 40 })).toBeNull();
    expect(levelFor('strongWind', { windGust: null })).toBeNull();
  });
});

describe('chaleur', () => {
  it('suit les seuils de temperature', () => {
    expect(levelFor('heat', { temperature: 37 })).toBe('high');
    expect(levelFor('heat', { temperature: 34 })).toBe('moderate');
    expect(levelFor('heat', { temperature: 31 })).toBe('low');
    expect(levelFor('heat', { temperature: 25 })).toBeNull();
    expect(levelFor('heat', { temperature: null })).toBeNull();
  });
});

describe('detectPhenomena, regroupement en episodes', () => {
  it('fusionne les heures a risque separees de deux heures calmes au plus', () => {
    const episodes = detectPhenomena(
      series([
        { windGust: 65 },
        {},
        {},
        { windGust: 90 },
        { windGust: 70 },
        {},
        {},
        {},
        { windGust: 62 },
      ]),
    ).filter((e) => e.kind === 'strongWind');
    expect(episodes).toHaveLength(2);
    expect(episodes[0]).toMatchObject({
      level: 'moderate',
      start: '2026-08-17T00:00',
      end: '2026-08-17T04:00',
      peakTime: '2026-08-17T03:00',
      evidence: { peakValue: 90 },
    });
    expect(episodes[1]).toMatchObject({ level: 'low', start: '2026-08-17T08:00' });
  });

  it('retient la pointe la plus extreme a niveau egal, minimum pour le gel', () => {
    const frost = detectPhenomena(
      series([{ temperature: -0.5 }, { temperature: -3 }, { temperature: -1 }]),
    ).find((e) => e.kind === 'frost');
    expect(frost?.peakTime).toBe('2026-08-17T01:00');
    expect(frost?.evidence.peakValue).toBe(-3);

    const wind = detectPhenomena(
      series([{ windGust: 62 }, { windGust: 70 }, { windGust: 65 }]),
    ).find((e) => e.kind === 'strongWind');
    expect(wind?.peakTime).toBe('2026-08-17T01:00');
  });

  it('garde la pointe connue quand une heure a risque n a pas de valeur', () => {
    const snow = detectPhenomena(
      series([{ snowfall: 0.4 }, { snowfall: null, weatherCode: 71 }]),
    ).find((e) => e.kind === 'snow');
    expect(snow?.evidence.peakValue).toBe(0.4);

    const snowFromCode = detectPhenomena(
      series([{ snowfall: null, weatherCode: 71 }, { snowfall: 0.3 }]),
    ).find((e) => e.kind === 'snow');
    expect(snowFromCode?.evidence.peakValue).toBe(0.3);
  });

  it('porte le modele du point de pointe et les indices orageux', () => {
    const [storm] = detectPhenomena(
      series([{ cape: 1500, precipitation: 2, weatherCode: 95 }], 'arome'),
    );
    expect(storm).toMatchObject({
      kind: 'thunderstorm',
      model: 'arome',
      evidence: { cape: 1500, weatherCode: 95 },
    });
    expect(detectPhenomena(series([{ windGust: 70 }]))[0]?.model).toBeNull();
  });

  it('trie par gravite puis par debut', () => {
    const episodes = detectPhenomena(
      series([{ temperature: 1 }, { temperature: 15, windGust: 85 }, {}, {}, {}, { windGust: 85 }]),
    );
    expect(episodes.map((e) => `${e.kind}:${e.start.slice(11)}`)).toEqual([
      'strongWind:01:00',
      'strongWind:05:00',
      'frost:00:00',
    ]);
  });

  it('ne produit rien sur une journee calme ou une serie vide', () => {
    expect(detectPhenomena(series([{}, {}, {}]))).toEqual([]);
    expect(detectPhenomena([])).toEqual([]);
  });
});

describe('worstLevelByKind', () => {
  it('retient le niveau le plus eleve par phenomene', () => {
    const episodes = detectPhenomena(
      series([{ windGust: 65 }, {}, {}, {}, { windGust: 105 }, {}, {}, {}, { windGust: 85 }]),
    );
    expect(worstLevelByKind(episodes)).toEqual({ strongWind: 'high' });
  });
});

describe('thunderRiskOf, utilise aussi par la carte', () => {
  it('rend le niveau et la CAPE qui le justifie', () => {
    expect(thunderRiskOf({ cape: 1200, precipitation: 1, weatherCode: 3 })).toEqual({
      level: 'moderate',
      value: 1200,
    });
    expect(thunderRiskOf({ cape: null, precipitation: null, weatherCode: 96 })).toEqual({
      level: 'high',
      value: null,
    });
  });

  it('ne dit rien quand rien ne justifie un orage', () => {
    expect(thunderRiskOf({ cape: 300, precipitation: 2, weatherCode: 61 })).toBeNull();
    expect(thunderRiskOf({ cape: null, precipitation: null, weatherCode: null })).toBeNull();
  });
});
