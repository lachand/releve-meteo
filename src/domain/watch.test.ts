import { describe, expect, it } from 'vitest';
import type { AlertHit } from './alerts';
import type { AlertRule, Place } from './types';
import {
  NOTIFIED_RETENTION_HOURS,
  alertKey,
  emptyWatchState,
  pruneNotified,
  spreadKey,
  vigilanceKey,
  watchedPlaces,
} from './watch';

function place(id: string): Place {
  return { id, name: id, latitude: 45, longitude: 5, elevation: 200, admin: null, alias: null };
}

function rule(placeId: string, enabled = true): AlertRule {
  return {
    id: `r-${placeId}`,
    placeId,
    variable: 'temperature',
    comparator: 'lt',
    threshold: 2,
    enabled,
  };
}

describe('watchedPlaces', () => {
  it('veille les favoris, puis les lieux connus portant une regle active, sans doublon', () => {
    const places = watchedPlaces({
      favourites: [place('lyon'), place('brest'), place('lyon')],
      rules: [rule('lyon'), rule('annecy'), rule('nice', false)],
      known: [place('annecy'), place('nice'), place('lyon'), place('annecy')],
    });
    expect(places.map((p) => p.id)).toEqual(['lyon', 'brest', 'annecy']);
  });

  it('ne veille rien sans favori ni regle', () => {
    expect(watchedPlaces({ favourites: [], rules: [], known: [place('lyon')] })).toEqual([]);
  });
});

describe('cles de notification', () => {
  it('une alerte par regle et par premiere heure franchie', () => {
    const hit: AlertHit = {
      rule: rule('lyon'),
      first: { time: '2026-09-29T06:00', value: 1, model: 'arome' },
      extreme: { time: '2026-09-29T07:00', value: 0, model: 'arome' },
      hours: 2,
    };
    expect(alertKey(hit)).toBe('alerte|r-lyon|2026-09-29T06:00');
  });

  it('un desaccord entre modeles par regle et par premiere heure depassee', () => {
    const crossing = {
      time: '2026-09-29T06:00' as const,
      variable: 'temperature' as const,
      spread: 5,
      modelCount: 3,
      high: { model: 'arome' as const, value: 15 },
      low: { model: 'gfs' as const, value: 10 },
    };
    const hit = {
      rule: {
        id: 'r-ecart',
        placeId: 'lyon',
        variable: 'temperature',
        comparator: 'gt',
        threshold: 3,
        enabled: true,
        kind: 'spread',
      } as const,
      first: crossing,
      extreme: crossing,
      hours: 2,
    };
    expect(spreadKey(hit)).toBe('ecart|r-ecart|2026-09-29T06:00');
  });

  it('une vigilance par phenomene, niveau, debut et domaine', () => {
    const warning = {
      phenomenon: 'waves',
      level: 3,
      beginUtcMs: 1000,
      endUtcMs: 2000,
      coastal: true,
    } as const;
    expect(vigilanceKey('33', warning)).toBe('vigilance|33|waves|3|1000|littoral');
    expect(vigilanceKey('33', { ...warning, coastal: false })).toBe(
      'vigilance|33|waves|3|1000|terre',
    );
  });
});

describe('pruneNotified', () => {
  it(`oublie les cles de plus de ${NOTIFIED_RETENTION_HOURS} h`, () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const hour = 60 * 60 * 1000;
    expect(
      pruneNotified(
        {
          recent: now.getTime() - hour,
          limit: now.getTime() - NOTIFIED_RETENTION_HOURS * hour,
          old: now.getTime() - (NOTIFIED_RETENTION_HOURS + 1) * hour,
        },
        now,
      ),
    ).toEqual({
      recent: now.getTime() - hour,
      limit: now.getTime() - NOTIFIED_RETENTION_HOURS * hour,
    });
  });

  it('part d un etat vide', () => {
    expect(emptyWatchState()).toEqual({
      entries: [],
      windUnit: 'kmh',
      notified: {},
      lastRunUtcMs: null,
    });
  });
});
