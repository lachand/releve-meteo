import { describe, expect, it } from 'vitest';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import type { AlertPoint } from './alerts';
import type { PhenomenonEpisode } from './phenomena';
import {
  DEFAULT_NOTIFY,
  MORNING_GRACE_HOURS,
  POLLEN_THRESHOLDS,
  highPollen,
  lightningKey,
  morningDue,
  normalizeNotify,
  pollenKey,
  rainAhead,
  rainKey,
  violentEpisodes,
  violentKey,
} from './weatherNotices';

// Lundi 28 septembre 2026, 10 h 12 locales.
const NOW = new Date('2026-09-28T08:12:00Z');

describe('normalizeNotify', () => {
  it('relit des preferences completes', () => {
    expect(
      normalizeNotify({
        risks: true,
        rain: true,
        pollen: false,
        lightning: true,
        mode: 'instant',
        hour: 6,
      }),
    ).toEqual({
      risks: true,
      rain: true,
      pollen: false,
      lightning: true,
      mode: 'instant',
      hour: 6,
    });
  });

  it('tolere l absence, un type errone ou une heure hors plage', () => {
    expect(normalizeNotify(undefined)).toEqual(DEFAULT_NOTIFY);
    expect(normalizeNotify(null)).toEqual(DEFAULT_NOTIFY);
    expect(normalizeNotify('oups')).toEqual(DEFAULT_NOTIFY);
    expect(normalizeNotify({ risks: 'oui', mode: 'autre', hour: 7.5 })).toEqual(DEFAULT_NOTIFY);
    expect(normalizeNotify({ hour: 24 }).hour).toBe(DEFAULT_NOTIFY.hour);
    expect(normalizeNotify({ hour: -1 }).hour).toBe(DEFAULT_NOTIFY.hour);
    expect(normalizeNotify({ hour: 0 }).hour).toBe(0);
    expect(normalizeNotify({ hour: 23 }).hour).toBe(23);
  });

  it('ne notifie rien par defaut', () => {
    expect(DEFAULT_NOTIFY).toMatchObject({
      risks: false,
      rain: false,
      pollen: false,
      lightning: false,
    });
  });
});

describe('morningDue', () => {
  it('rend la date locale de l heure choisie jusqu a six heures plus tard', () => {
    expect(morningDue(new Date('2026-09-28T05:00:00Z'), 7)).toBe('2026-09-28'); // 7 h
    expect(morningDue(new Date('2026-09-28T10:59:00Z'), 7)).toBe('2026-09-28'); // 12 h 59
    expect(MORNING_GRACE_HOURS).toBe(6);
  });

  it('rend null avant l heure choisie et apres la plage, en heure de Paris', () => {
    expect(morningDue(new Date('2026-09-28T04:59:00Z'), 7)).toBeNull(); // 6 h 59
    expect(morningDue(new Date('2026-09-28T11:00:00Z'), 7)).toBeNull(); // 13 h
    expect(morningDue(new Date('2027-01-12T06:00:00Z'), 7)).toBe('2027-01-12'); // 7 h, hiver
  });

  it('ne passe pas minuit', () => {
    expect(morningDue(new Date('2026-09-28T21:30:00Z'), 22)).toBe('2026-09-28'); // 23 h 30
    expect(morningDue(new Date('2026-09-28T22:30:00Z'), 22)).toBeNull(); // 0 h 30 le 29
  });
});

describe('violentEpisodes', () => {
  function episode(
    kind: PhenomenonEpisode['kind'],
    level: PhenomenonEpisode['level'],
    start: string,
    end = start,
  ): PhenomenonEpisode {
    return {
      kind,
      level,
      start: start as PhenomenonEpisode['start'],
      end: end as PhenomenonEpisode['end'],
      peakTime: start as PhenomenonEpisode['start'],
      evidence: { peakValue: 1, cape: null, weatherCode: null },
      model: 'arome',
    };
  }

  it('garde les orages, fortes pluies, vents forts et pluies verglacantes des le niveau modere', () => {
    const kept = violentEpisodes(
      [
        episode('thunderstorm', 'moderate', '2026-09-28T16:00'),
        episode('heavyRain', 'moderate', '2026-09-28T17:00'),
        episode('strongWind', 'moderate', '2026-09-28T18:00'),
        episode('freezingRain', 'moderate', '2026-09-28T19:00'),
      ],
      NOW,
    );
    expect(kept).toHaveLength(4);
  });

  it('ne garde gel, neige, brouillard et chaleur qu au niveau fort, et ignore le niveau faible', () => {
    const kept = violentEpisodes(
      [
        episode('frost', 'moderate', '2026-09-28T16:00'),
        episode('heat', 'moderate', '2026-09-28T16:00'),
        episode('snow', 'high', '2026-09-28T16:00'),
        episode('fog', 'high', '2026-09-28T16:00'),
        episode('thunderstorm', 'low', '2026-09-28T16:00'),
      ],
      NOW,
    );
    expect(kept.map((e) => e.kind)).toEqual(['snow', 'fog']);
  });

  it('ecarte un episode termine ou trop lointain, garde celui en cours', () => {
    const kept = violentEpisodes(
      [
        episode('thunderstorm', 'high', '2026-09-28T06:00', '2026-09-28T09:00'),
        episode('thunderstorm', 'high', '2026-09-28T09:00', '2026-09-28T12:00'),
        episode('thunderstorm', 'high', '2026-09-30T11:00'),
        episode('thunderstorm', 'high', '2026-09-30T10:00'),
      ],
      NOW,
    );
    expect(kept.map((e) => e.start)).toEqual(['2026-09-28T09:00', '2026-09-30T10:00']);
    expect(
      violentEpisodes([episode('thunderstorm', 'high', '2026-09-30T11:00')], NOW, 72),
    ).toHaveLength(1);
  });

  it('une cle par lieu, nature et debut', () => {
    expect(violentKey('lyon', episode('thunderstorm', 'high', '2026-09-28T16:00'))).toBe(
      'risque|lyon|thunderstorm|2026-09-28T16:00',
    );
  });
});

describe('rainAhead', () => {
  const TIMELINE = buildHourlyTimeline('2026-09-28T09:00', 30);
  function points(rain: (index: number) => number | null): AlertPoint[] {
    return TIMELINE.map((time, index) => ({
      ...hourlyPoint(time, { precipitation: rain(index) }),
      model: 'arome' as const,
    }));
  }

  it('annonce la premiere heure pluvieuse des trois prochaines heures et le cumul sur 24 h', () => {
    // 10 h 12 : 11 h est l'index 2 (lead 0,8 h), 13 h l'index 4 (lead 2,8 h).
    const found = rainAhead(
      points((i) => (i === 4 ? 1.2 : i === 10 ? 2 : 0)),
      NOW,
    );
    expect(found).toMatchObject({ start: '2026-09-28T13:00', model: 'arome' });
    expect(found?.totalMm).toBeCloseTo(3.2);
  });

  it('se tait quand la pluie vient plus tard, ou reste sous le seuil', () => {
    expect(
      rainAhead(
        points((i) => (i === 8 ? 5 : 0)),
        NOW,
      ),
    ).toBeNull();
    expect(
      rainAhead(
        points(() => 0.2),
        NOW,
      ),
    ).toBeNull();
    expect(rainAhead([], NOW)).toBeNull();
  });

  it('ne compte pas une valeur absente comme de la pluie ni comme zero', () => {
    expect(
      rainAhead(
        points(() => null),
        NOW,
      ),
    ).toBeNull();
    const found = rainAhead(
      points((i) => (i === 3 ? 1 : i === 5 ? null : 0)),
      NOW,
    );
    expect(found?.totalMm).toBe(1);
  });

  it('une cle par lieu et par plage de six heures', () => {
    expect(rainKey('lyon', '2026-09-28T13:00')).toBe('pluie|lyon|2026-09-28|2');
    expect(rainKey('lyon', '2026-09-28T05:00')).toBe('pluie|lyon|2026-09-28|0');
  });
});

describe('highPollen', () => {
  const TIMELINE = buildHourlyTimeline('2026-09-28T09:00', 30);
  const series = (value: (i: number) => number | null) => TIMELINE.map((_, i) => value(i));

  it('liste les pollens eleves des prochaines 24 h, du plus fort au moins fort', () => {
    const found = highPollen(
      TIMELINE,
      {
        birch: series((i) => (i === 6 ? 150 : 5)),
        grass: series((i) => (i === 8 ? POLLEN_THRESHOLDS.high : 5)),
        olive: series(() => 79),
      },
      NOW,
    );
    expect(found).toEqual([
      { kind: 'birch', peak: 150 },
      { kind: 'grass', peak: 80 },
    ]);
  });

  it('ignore les valeurs absentes et ce qui depasse la fenetre', () => {
    expect(
      highPollen(
        TIMELINE,
        { birch: series(() => null), alder: series((i) => (i >= 28 ? 500 : 1)) },
        NOW,
      ),
    ).toEqual([]);
    expect(highPollen(TIMELINE, { birch: [] }, NOW)).toEqual([]);
  });

  it('une cle par lieu et par jour', () => {
    expect(pollenKey('lyon', '2026-09-28')).toBe('pollen|lyon|2026-09-28');
  });
});

describe('lightningKey', () => {
  it('est unique par lieu et par plage de trois heures, en heure de Paris', () => {
    // 10 h 12 et 11 h 59 locales : meme plage (9 h a 12 h).
    expect(lightningKey('lyon', NOW)).toBe('foudre|lyon|2026-09-28|3');
    expect(lightningKey('lyon', new Date('2026-09-28T09:59:00Z'))).toBe('foudre|lyon|2026-09-28|3');
    // 12 h locales : plage suivante.
    expect(lightningKey('lyon', new Date('2026-09-28T10:00:00Z'))).toBe('foudre|lyon|2026-09-28|4');
  });
});
