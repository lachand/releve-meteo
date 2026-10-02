import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import forecastLyon from '../../tests/fixtures/live/forecast-lyon.json';
import { server } from '../../tests/msw';
import { blendDaily } from '../domain/dailyBlend';
import type { WatchEntry } from '../domain/watch';
import { loadEntryForecast } from '../pwa/watchRun';
import { sharedPlaceSearch } from '../ui/sharedPlace';
import type { EntryForecast } from '../pwa/watchRun';
import { weatherIcon } from './icon';
import {
  WIDGET_DAYS,
  WIDGET_HOURS,
  WIDGET_PAYLOAD_VERSION,
  WIDGET_TRACK_HOURS,
  widgetPayload,
  widgetPlace,
} from './payload';

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
  department: null,
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

describe('widgetPlace', () => {
  it('donne le modele retenu, la temperature, l ecart des autres, la confiance et les heures a venir', async () => {
    const place = widgetPlace({ entry: LYON, forecast: await forecastOf(LYON), now: NOW });
    expect(place.id).toBe(LYON.place.id);
    expect(place.name).toBe('Lyon');
    expect(place.now).not.toBeNull();
    // L'heure en cours des fixtures : la premiere heure du modele retenu a partir de l'instant.
    expect(place.now?.time).toBe('2026-09-28T16:00');
    expect(typeof place.now?.model).toBe('string');
    expect(typeof place.now?.temperature).toBe('number');
    expect(place.now?.others).toBeGreaterThan(0);
    expect(place.now?.meanGap).not.toBeNull();
    expect(['high', 'medium', 'low']).toContain(place.now?.confidence);
    // Les douze heures qui suivent l'heure en cours, une par une.
    expect(place.hours).toHaveLength(WIDGET_HOURS);
    expect(place.hours[0]?.time).toBe('2026-09-28T17:00');
    expect(place.hours.at(-1)?.time).toBe('2026-09-29T04:00');
    expect(place.day?.tempMax).not.toBeNull();
  });

  it('dit le temps du moment par une icone et son libelle', async () => {
    const place = widgetPlace({ entry: LYON, forecast: await forecastOf(LYON), now: NOW });
    expect(place.now?.icon).not.toBeUndefined();
    if (place.now?.icon !== null) {
      expect(place.now?.label).not.toBeNull();
    }
  });

  it('donne les jours a venir, un modele par jour, sans inventer une valeur absente', async () => {
    const place = widgetPlace({ entry: LYON, forecast: await forecastOf(LYON), now: NOW });
    expect(place.days.length).toBeGreaterThanOrEqual(2);
    expect(place.days.length).toBeLessThanOrEqual(WIDGET_DAYS);
    expect(place.days[0]?.date).toBe('2026-09-28');
    const dates = place.days.map((day) => day.date);
    expect([...dates].sort()).toEqual(dates);
    for (const day of place.days) {
      expect(typeof day.model).toBe('string');
      expect(day.tempMax).not.toBeUndefined();
      if (day.tempMax !== null && day.tempMin !== null) {
        expect(day.tempMax).toBeGreaterThanOrEqual(day.tempMin);
      }
    }
  });

  it('dit pour aujourd hui le temps des heures restantes, pas celui des heures passees', async () => {
    const forecast = await forecastOf(LYON);
    const withCode = (code: number | null): EntryForecast => ({
      ...forecast,
      cascade: {
        ...forecast.cascade,
        points: forecast.cascade.points.map((point) =>
          point !== null && point.time.startsWith('2026-09-28')
            ? { ...point, weatherCode: code }
            : point,
        ),
      },
    });
    const clear = widgetPlace({ entry: LYON, forecast: withCode(0), now: NOW });
    expect(clear.days[0]?.date).toBe('2026-09-28');
    expect(clear.days[0]?.icon).toBe('clear');
    expect(clear.days[0]?.label).toBe('Ciel dégagé');
    const stormy = widgetPlace({ entry: LYON, forecast: withCode(95), now: NOW });
    expect(stormy.days[0]?.icon).toBe('thunder');
    // Les jours suivants gardent le temps du jour entier du modele.
    expect(stormy.days[1]?.icon).toBe(clear.days[1]?.icon);
  });

  it('garde le temps du jour du modele quand aucune heure restante ne donne de code', async () => {
    const forecast = await forecastOf(LYON);
    const bare: EntryForecast = {
      ...forecast,
      cascade: {
        ...forecast.cascade,
        points: forecast.cascade.points.map((point) =>
          point === null ? null : { ...point, weatherCode: null },
        ),
      },
    };
    const kept = widgetPlace({ entry: LYON, forecast: bare, now: NOW });
    const daily = blendDaily({
      bundle: forecast.bundle,
      context: forecast.cascade.context,
      now: NOW,
      preferred: null,
    })[0];
    expect(kept.days[0]?.icon).toBe(weatherIcon(daily?.weatherCode ?? null, true));
    expect(kept.days[0]?.date).toBe('2026-09-28');
  });

  it('donne le vent, les rafales et l humidite du moment, tels que le modele retenu les porte', async () => {
    const forecast = await forecastOf(LYON);
    const nowPoint = forecast.cascade.points[forecast.cascade.nowIndex];
    const place = widgetPlace({ entry: LYON, forecast, now: NOW });
    expect(place.now?.windSpeed).toBe(nowPoint?.windSpeed.value);
    expect(place.now?.windGust).toBe(nowPoint?.windGust.value);
    expect(place.now?.humidity).toBe(nowPoint?.humidity.value);
    // Une valeur absente reste null, jamais zero.
    const bare: EntryForecast = {
      ...forecast,
      cascade: {
        ...forecast.cascade,
        points: forecast.cascade.points.map((point, index) =>
          point !== null && index === forecast.cascade.nowIndex
            ? {
                ...point,
                windSpeed: { ...point.windSpeed, value: null },
                windGust: { ...point.windGust, value: null },
                humidity: { ...point.humidity, value: null },
              }
            : point,
        ),
      },
    };
    const missing = widgetPlace({ entry: LYON, forecast: bare, now: NOW });
    expect(missing.now?.windSpeed).toBeNull();
    expect(missing.now?.windGust).toBeNull();
    expect(missing.now?.humidity).toBeNull();
  });

  it('donne l heure du lever et du coucher du soleil d aujourd hui', async () => {
    const place = widgetPlace({ entry: LYON, forecast: await forecastOf(LYON), now: NOW });
    expect(place.sun?.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(place.sun?.sunset).toMatch(/^\d{2}:\d{2}$/);
  });

  it('donne la serie des 24 prochaines heures avec le modele de chaque heure', async () => {
    const forecast = await forecastOf(LYON);
    const place = widgetPlace({ entry: LYON, forecast, now: NOW });
    expect(place.track.length).toBeGreaterThan(12);
    expect(place.track.length).toBeLessThanOrEqual(WIDGET_TRACK_HOURS);
    expect(place.track[0]?.time).toBe(place.now?.time);
    const times = place.track.map((point) => point.time);
    expect([...times].sort()).toEqual(times);
    for (const point of place.track) {
      expect(typeof point.model).toBe('string');
      expect(point.temperature === null || typeof point.temperature === 'number').toBe(true);
      expect(point.precipitation === null || typeof point.precipitation === 'number').toBe(true);
    }
  });

  it('ne donne aucune serie quand la prevision ne couvre plus l heure en cours', async () => {
    const forecast = await forecastOf(LYON);
    const later = widgetPlace({
      entry: LYON,
      forecast: { ...forecast, cascade: { ...forecast.cascade, nowIndex: -1 } },
      now: NOW,
    });
    expect(later.track).toEqual([]);
    expect(later.sun).not.toBeUndefined();
  });

  it('ne donne aucun jour sans prevision quotidienne', async () => {
    const forecast = await forecastOf(LYON);
    const bare = {
      ...forecast,
      bundle: {
        ...forecast.bundle,
        series: Object.fromEntries(
          Object.entries(forecast.bundle.series).map(([model, series]) => [
            model,
            { ...series, daily: [] },
          ]),
        ),
      },
    } as EntryForecast;
    expect(widgetPlace({ entry: LYON, forecast: bare, now: NOW }).days).toEqual([]);
  });

  it('porte le lien qui ouvre ce lieu dans l application', async () => {
    const place = widgetPlace({ entry: LYON, forecast: await forecastOf(LYON), now: NOW });
    expect(place.link).toBe(sharedPlaceSearch(LYON.place));
    expect(place.link).toContain('lat=');
    expect(place.link).toContain('nom=');
  });

  it('prefere l alias du lieu, et ne dit aucune confiance quand le terrain est inconnu', async () => {
    const entry: WatchEntry = {
      ...LYON,
      terrain: null,
      place: { ...LYON.place, alias: 'Chez nous' },
    };
    const place = widgetPlace({ entry, forecast: await forecastOf(entry), now: NOW });
    expect(place.name).toBe('Chez nous');
    expect(place.now?.confidence).toBe('unavailable');
  });

  it('ne dit pas « maintenant » quand la prevision ne couvre plus l heure en cours', async () => {
    const forecast = await forecastOf(LYON);
    const later = widgetPlace({
      entry: LYON,
      forecast: { ...forecast, cascade: { ...forecast.cascade, nowIndex: -1 } },
      now: NOW,
    });
    expect(later.now).toBeNull();
    expect(later.hours).toEqual([]);
  });

  it('saute une heure sans point de cascade, sans la remplacer par une valeur', async () => {
    const forecast = await forecastOf(LYON);
    const points = forecast.cascade.points.map((point, index) =>
      index === forecast.cascade.nowIndex + 2 ? null : point,
    );
    const place = widgetPlace({
      entry: LYON,
      forecast: { ...forecast, cascade: { ...forecast.cascade, points } },
      now: NOW,
    });
    expect(place.hours).toHaveLength(WIDGET_HOURS - 1);
    expect(place.hours.map((hour) => hour.time)).not.toContain('2026-09-28T18:00');
  });

  it('ne dit pas « maintenant » quand le modele retenu n a pas de temperature', async () => {
    const forecast = await forecastOf(LYON);
    const points = forecast.cascade.points.map((point, index) =>
      index === forecast.cascade.nowIndex && point !== null
        ? { ...point, temperature: { value: null, provenance: point.temperature.provenance } }
        : point,
    );
    const place = widgetPlace({
      entry: LYON,
      forecast: { ...forecast, cascade: { ...forecast.cascade, points } },
      now: NOW,
    });
    expect(place.now).toBeNull();
    // Les heures suivantes restent dites : la temperature absente n'en efface pas la suite.
    expect(place.hours).toHaveLength(WIDGET_HOURS);
  });
});

describe('widgetPayload', () => {
  it('un lieu par prevision lue, les autres signales injoignables, et l instant du calcul', async () => {
    const brest: WatchEntry = { ...LYON, place: { ...LYON.place, id: 'brest', name: 'Brest' } };
    const payload = widgetPayload({
      entries: [LYON, brest],
      forecasts: [await forecastOf(LYON), null],
      now: NOW,
    });
    expect(payload.version).toBe(WIDGET_PAYLOAD_VERSION);
    expect(payload.generatedAtMs).toBe(NOW.getTime());
    expect(payload.places.map((place) => place.id)).toEqual([LYON.place.id]);
    expect(payload.unreachable).toEqual(['brest']);
  });

  it('rend un contenu vide sans lieu, sans erreur', () => {
    expect(widgetPayload({ entries: [], forecasts: [], now: NOW })).toEqual({
      version: 1,
      generatedAtMs: NOW.getTime(),
      places: [],
      unreachable: [],
    });
  });

  it('tient pour injoignable un lieu dont la prevision manque dans la liste', () => {
    expect(widgetPayload({ entries: [LYON], forecasts: [], now: NOW }).unreachable).toEqual([
      LYON.place.id,
    ]);
  });
});
