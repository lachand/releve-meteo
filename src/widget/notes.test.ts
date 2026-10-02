import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import forecastLyon from '../../tests/fixtures/live/forecast-lyon.json';
import { buildHourlyTimeline, hourlyPoint } from '../../tests/factories';
import { server } from '../../tests/msw';
import type { AlertPoint } from '../domain/alerts';
import type { ModelVerification } from '../domain/reliability';
import type { VigilanceWarning } from '../domain/vigilance';
import type { WatchEntry } from '../domain/watch';
import { loadEntryForecast } from '../pwa/watchRun';
import type { EntryForecast } from '../pwa/watchRun';
import { NOTE_RAIN_HOURS, WIDGET_NOTES_MAX, nextRain, widgetNotes } from './notes';

// 15 h 27 locale le 28 septembre 2026 : l'instant des fixtures enregistrees.
const NOW = new Date('2026-09-28T13:27:00Z');

const LYON: WatchEntry = {
  place: {
    id: '45.7578:4.8320',
    name: 'Lyon',
    latitude: 45.7578,
    longitude: 4.832,
    elevation: 170,
    admin: 'Rhône',
    alias: null,
  },
  department: { code: '69', name: 'Rhône' },
  rules: [],
  terrain: { kind: 'plain', elevation: 170, distanceToCoastKm: 300 },
  verification: [],
  preferred: null,
};

async function forecastOf(entry: WatchEntry): Promise<EntryForecast> {
  server.use(
    http.get('https://api.open-meteo.com/v1/forecast', () => HttpResponse.json(forecastLyon)),
  );
  const forecast = await loadEntryForecast(entry, NOW);
  if (forecast === null) {
    throw new Error('prevision de test illisible');
  }
  return forecast;
}

const TIMELINE = buildHourlyTimeline('2026-09-28T15:00', 40);
function rainPoints(rain: (index: number) => number | null): AlertPoint[] {
  return TIMELINE.map((time, index) => ({
    ...hourlyPoint(time, { precipitation: rain(index) }),
    model: 'arome' as const,
  }));
}

describe('nextRain', () => {
  it('donne la premiere heure pluvieuse et le cumul sur 24 h', () => {
    const rain = nextRain(
      rainPoints((i) => (i === 3 ? 1.2 : i === 10 ? 2 : 0)),
      NOW,
    );
    expect(rain).toMatchObject({ start: '2026-09-28T18:00', model: 'arome' });
    expect(rain?.totalMm).toBeCloseTo(3.2);
  });

  it('dit le temps sec quand aucune heure n atteint le seuil', () => {
    const rain = nextRain(
      rainPoints(() => 0.1),
      NOW,
    );
    expect(rain?.start).toBeNull();
  });

  it('ne prend pas l absence de donnee pour du sec, ni pour de la pluie', () => {
    expect(
      nextRain(
        rainPoints(() => null),
        NOW,
      ),
    ).toBeNull();
    expect(nextRain([], NOW)).toBeNull();
    const rain = nextRain(
      rainPoints((i) => (i === 2 ? null : i === 4 ? 1 : 0)),
      NOW,
    );
    expect(rain?.totalMm).toBe(1);
  });

  it('ignore la pluie au dela de la fenetre', () => {
    const beyond = TIMELINE.findIndex((_, i) => i > NOTE_RAIN_HOURS + 2);
    const rain = nextRain(
      rainPoints((i) => (i === beyond ? 5 : 0)),
      NOW,
    );
    expect(rain?.start).toBeNull();
    expect(rain?.totalMm).toBe(0);
  });
});

const VERIFIED: ModelVerification = {
  model: 'arome',
  variable: 'temperature',
  leadDays: 1,
  stats: { mae: 0.64, bias: 0.1, rmse: 0.9, count: 330 },
  rain: null,
  sampleCount: 330,
  status: 'ready',
  reference: 'observed',
};

const ORANGE_STORMS: VigilanceWarning = {
  phenomenon: 'thunderstorm',
  level: 3,
  beginUtcMs: Date.parse('2026-09-28T15:00:00Z'),
  endUtcMs: Date.parse('2026-09-28T21:00:00Z'),
  coastal: false,
};

describe('widgetNotes', () => {
  it('ne dit que ce qui s applique : sans regle, vigilance ni verification, pluie et fourchette seulement', async () => {
    const notes = widgetNotes({
      entry: LYON,
      forecast: await forecastOf(LYON),
      now: NOW,
      windUnit: 'kmh',
      vigilance: [],
    });
    const kinds = notes.map((note) => note.kind);
    expect(kinds).not.toContain('alert');
    expect(kinds).not.toContain('vigilance');
    expect(kinds).not.toContain('reliability');
    expect(kinds).toContain('rain');
  });

  it('classe : alerte personnelle, vigilance, phenomene, pluie, fiabilite, fourchette', async () => {
    const entry: WatchEntry = {
      ...LYON,
      verification: [VERIFIED],
      rules: [
        {
          id: 'toujours',
          placeId: LYON.place.id,
          variable: 'temperature',
          comparator: 'gt',
          threshold: -50,
          enabled: true,
        },
      ],
    };
    const forecast = await forecastOf(entry);
    const notes = widgetNotes({
      entry,
      forecast,
      now: NOW,
      windUnit: 'kmh',
      vigilance: [ORANGE_STORMS],
    });
    const order = ['alert', 'vigilance', 'phenomenon', 'rain', 'reliability', 'spread'];
    const ranks = notes.map((note) => order.indexOf(note.kind));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(notes[0]?.kind).toBe('alert');
    expect(notes[0]?.level).toBe('alert');
    expect(notes[0]?.short).toMatch(/^Alerte : /);
    expect(notes[1]?.kind).toBe('vigilance');
    expect(notes[1]?.text).toContain('Vigilance orange orages');
    expect(notes[1]?.text).toContain('Source Météo-France');
    expect(notes.map((n) => n.kind)).toContain('reliability');
    expect(notes.length).toBeLessThanOrEqual(WIDGET_NOTES_MAX);
  });

  it('ne retient que l orange et le rouge, et seulement avec un departement connu', async () => {
    const forecast = await forecastOf(LYON);
    const yellow: VigilanceWarning = { ...ORANGE_STORMS, level: 2 };
    const kindsOf = (entry: WatchEntry, vigilance: readonly VigilanceWarning[]) =>
      widgetNotes({ entry, forecast, now: NOW, windUnit: 'kmh', vigilance }).map((n) => n.kind);
    expect(kindsOf(LYON, [yellow])).not.toContain('vigilance');
    expect(kindsOf({ ...LYON, department: null }, [ORANGE_STORMS])).not.toContain('vigilance');
    expect(kindsOf(LYON, [{ ...ORANGE_STORMS, level: 4 }])).toContain('vigilance');
  });

  it('dit la fiabilite du modele retenu avec la nature de la reference', async () => {
    const forecast = await forecastOf(LYON);
    const nowModel = forecast.cascade.points[forecast.cascade.nowIndex]?.model;
    expect(nowModel).toBeDefined();
    const entry: WatchEntry = {
      ...LYON,
      verification: [
        { ...VERIFIED, model: nowModel ?? 'arome' },
        { ...VERIFIED, model: nowModel ?? 'arome', leadDays: 3, stats: null, status: 'collecting' },
      ],
    };
    const notes = widgetNotes({ entry, forecast, now: NOW, windUnit: 'kmh', vigilance: [] });
    const note = notes.find((n) => n.kind === 'reliability');
    expect(note?.text).toContain('0,6 °C d’erreur moyenne ici');
    expect(note?.text).toContain('mesures de la station');
    const estimated = widgetNotes({
      entry: {
        ...entry,
        verification: [{ ...VERIFIED, model: nowModel ?? 'arome', reference: 'estimated' }],
      },
      forecast,
      now: NOW,
      windUnit: 'kmh',
      vigilance: [],
    }).find((n) => n.kind === 'reliability');
    expect(estimated?.text).toContain('estimation');
    // Un modele sans verification prete ne dit rien.
    const none = widgetNotes({
      entry: {
        ...entry,
        verification: [
          { ...VERIFIED, model: nowModel ?? 'arome', status: 'collecting', stats: null },
        ],
      },
      forecast,
      now: NOW,
      windUnit: 'kmh',
      vigilance: [],
    });
    expect(none.map((n) => n.kind)).not.toContain('reliability');
  });

  it('commence chaque phrase par une majuscule, sans valeur absente ni tiret cadratin', async () => {
    const entry: WatchEntry = { ...LYON, verification: [VERIFIED] };
    const notes = widgetNotes({
      entry,
      forecast: await forecastOf(entry),
      now: NOW,
      windUnit: 'kmh',
      vigilance: [ORANGE_STORMS],
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      for (const sentence of [note.text, note.short]) {
        expect(sentence.charAt(0)).toBe(sentence.charAt(0).toUpperCase());
        expect(sentence).not.toMatch(/undefined|null|NaN|—/);
      }
      expect(note.short.length).toBeLessThanOrEqual(note.text.length);
    }
  });

  it('ne donne aucune note de fourchette ni de fiabilite sans heure en cours', async () => {
    const forecast = await forecastOf(LYON);
    const later: EntryForecast = {
      ...forecast,
      cascade: { ...forecast.cascade, nowIndex: -1 },
    };
    const kinds = widgetNotes({
      entry: { ...LYON, verification: [VERIFIED] },
      forecast: later,
      now: NOW,
      windUnit: 'kmh',
      vigilance: [],
    }).map((n) => n.kind);
    expect(kinds).not.toContain('spread');
    expect(kinds).not.toContain('reliability');
  });
});
