import { describe, expect, it } from 'vitest';
import type { StationModelSeries, StationRecord } from './stationCheck';
import {
  SHORT_LEADS,
  leadScores,
  mergeSnapshots,
  takeSnapshot,
  type ForecastSnapshot,
} from './leadScores';
import type { LocalIsoHour } from './types';

// Lundi 28 septembre 2026, 10 h 12 locales.
const NOW = new Date('2026-09-28T08:12:00Z');

function hourAt(day: string, h: number): LocalIsoHour {
  return `${day}T${String(h).padStart(2, '0')}:00` as LocalIsoHour;
}

/** Serie au point de la station : 36 h passees, l'heure courante, puis 12 h a venir. */
function stationSeries(value: (time: LocalIsoHour) => number | null): StationModelSeries {
  const timeline: LocalIsoHour[] = [];
  for (let h = 0; h < 24; h += 1) {
    timeline.push(hourAt('2026-09-27', h));
  }
  for (let h = 0; h < 24; h += 1) {
    timeline.push(hourAt('2026-09-28', h));
  }
  return { timeline, temperature: { arome: timeline.map(value) } };
}

function record(time: LocalIsoHour, temperature: number | null): StationRecord {
  const measure = (value: number | null) => ({ value, provenance: 'observed' as const });
  return {
    time,
    temperature: measure(temperature),
    humidity: measure(null),
    precipitation: measure(null),
    windSpeed: measure(null),
    windDirection: measure(null),
    windGust: measure(null),
    pressure: measure(null),
  };
}

function snapshot(
  issuedAt: LocalIsoHour,
  model: 'arome' | 'gfs',
  offset: number,
  hours = 12,
): ForecastSnapshot {
  const start = Number(issuedAt.slice(11, 13));
  const timeline = Array.from({ length: hours }, (_, i) =>
    hourAt(issuedAt.slice(0, 10), start + 1 + i),
  );
  return {
    issuedAt,
    timeline,
    temperature: { [model]: timeline.map((_, i) => 10 + start + 1 + i + offset) },
  };
}

describe('takeSnapshot', () => {
  it('ne garde que les 12 heures a venir apres l heure de relevee, pas le passe ni l heure courante', () => {
    const series = stationSeries((time) => Number(time.slice(11, 13)));
    const taken = takeSnapshot(series, NOW);
    expect(taken?.issuedAt).toBe('2026-09-28T10:00');
    expect(taken?.timeline).toHaveLength(SHORT_LEADS.horizonHours);
    expect(taken?.timeline[0]).toBe('2026-09-28T11:00');
    expect(taken?.timeline.at(-1)).toBe('2026-09-28T22:00');
    expect(taken?.temperature.arome).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it('omet un modele sans aucune valeur a venir et rend null quand il ne reste rien', () => {
    const empty = stationSeries((time) => (time < '2026-09-28T11:00' ? 5 : null));
    expect(takeSnapshot(empty, NOW)).toBeNull();
    expect(takeSnapshot({ timeline: [], temperature: {} }, NOW)).toBeNull();
  });

  it('garde les valeurs absentes en null, sans les remplacer', () => {
    const series = stationSeries((time) => (time === '2026-09-28T13:00' ? null : 20));
    expect(takeSnapshot(series, NOW)?.temperature.arome?.[2]).toBeNull();
  });
});

describe('mergeSnapshots', () => {
  const a = snapshot('2026-09-28T08:00', 'arome', 0);
  const b = snapshot('2026-09-28T09:00', 'arome', 0);

  it('ajoute, remplace une meme heure de relevee et trie par heure', () => {
    const replaced = { ...b, temperature: { arome: b.timeline.map(() => 0) } };
    const merged = mergeSnapshots([b, a], [replaced], NOW);
    expect(merged.map((s) => s.issuedAt)).toEqual(['2026-09-28T08:00', '2026-09-28T09:00']);
    expect(merged[1]?.temperature.arome?.[0]).toBe(0);
  });

  it('oublie les instantanes plus vieux que la retention', () => {
    const old = snapshot('2026-09-20T08:00', 'arome', 0);
    const kept = snapshot('2026-09-22T11:00', 'arome', 0);
    const merged = mergeSnapshots([old, kept], [a], NOW);
    expect(merged.map((s) => s.issuedAt)).toEqual(['2026-09-22T11:00', '2026-09-28T08:00']);
  });
});

describe('leadScores', () => {
  const records = (from: number, to: number, value = (h: number) => 10 + h) => {
    const list: StationRecord[] = [];
    for (let h = from; h <= to; h += 1) {
      list.push(record(hourAt('2026-09-28', h), value(h)));
    }
    return list;
  };

  it('range les ecarts par echeance : 1 h, 2 a 3 h, 4 a 6 h, 7 a 12 h', () => {
    // Relevees de 0 h a 8 h, une par heure, AROME 1 °C trop chaud : toutes les echeances de 1 a 12 h.
    const snapshots = Array.from({ length: 9 }, (_, h) =>
      snapshot(hourAt('2026-09-28', h), 'arome', 1),
    );
    const scores = leadScores({ snapshots, records: records(1, 20), now: NOW });
    expect(scores.buckets.map((b) => b.label)).toEqual(['1 h', '3 h', '6 h', '12 h']);
    const byLabel = Object.fromEntries(scores.buckets.map((b) => [b.label, b.models[0]]));
    expect(byLabel['1 h']).toMatchObject({ model: 'arome', pairs: 9, bias: 1, mae: 1 });
    // Une seule paire par heure mesuree et par classe : la relevee la plus recente.
    expect(byLabel['3 h']?.pairs).toBeGreaterThanOrEqual(SHORT_LEADS.minPairs);
    expect(scores.snapshots).toBe(9);
    expect(scores.ready).toBe(true);
  });

  it('ne compte jamais une heure sans mesure ni sans valeur du modele', () => {
    const snapshots = [
      snapshot('2026-09-28T00:00', 'arome', 2),
      snapshot('2026-09-28T01:00', 'arome', 2),
    ];
    const sparse = records(1, 13, (h) => 10 + h).filter((r) => r.time !== '2026-09-28T05:00');
    const withNull = [...sparse.slice(0, 3), record('2026-09-28T04:00', null), ...sparse.slice(3)];
    const scores = leadScores({ snapshots, records: withNull, now: NOW });
    const total = scores.buckets.reduce((sum, b) => sum + (b.models[0]?.pairs ?? 0), 0);
    // 12 heures par relevee, moins l heure sans mesure (5 h) et celle a mesure nulle (4 h).
    expect(total).toBeLessThan(24);
    expect(scores.buckets.flatMap((b) => b.models).every((m) => m.bias === 2)).toBe(true);
  });

  it('reste en collecte sous le minimum de paires, et dit combien d instantanes existent', () => {
    const scores = leadScores({
      snapshots: [snapshot('2026-09-28T08:00', 'arome', 0)],
      records: records(9, 10),
      now: NOW,
    });
    expect(scores.ready).toBe(false);
    expect(scores.snapshots).toBe(1);
    expect(scores.oldestIssuedAt).toBe('2026-09-28T08:00');
    expect(scores.buckets.every((b) => b.models.length === 0)).toBe(true);
  });

  it('classe les modeles du plus juste au moins juste dans chaque echeance', () => {
    const snapshots = Array.from({ length: 9 }, (_, h) => ({
      ...snapshot(hourAt('2026-09-28', h), 'arome', 3),
      temperature: {
        arome: snapshot(hourAt('2026-09-28', h), 'arome', 3).temperature.arome ?? [],
        gfs: snapshot(hourAt('2026-09-28', h), 'gfs', -1).temperature.gfs ?? [],
      },
    }));
    const scores = leadScores({ snapshots, records: records(1, 20), now: NOW });
    expect(scores.buckets[0]?.models.map((m) => m.model)).toEqual(['gfs', 'arome']);
  });

  it('rend un etat vide sans instantane', () => {
    expect(leadScores({ snapshots: [], records: [], now: NOW })).toMatchObject({
      ready: false,
      snapshots: 0,
      oldestIssuedAt: null,
    });
  });

  it('ignore les mesures posterieures a maintenant', () => {
    const snapshots = Array.from({ length: 9 }, (_, h) =>
      snapshot(hourAt('2026-09-28', h), 'arome', 1),
    );
    const future = [...records(1, 10), record('2026-09-28T15:00', 99)];
    const scores = leadScores({ snapshots, records: future, now: NOW });
    expect(scores.buckets.flatMap((b) => b.models).every((m) => m.mae < 5)).toBe(true);
  });
});
