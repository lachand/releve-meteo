import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../tests/msw';
import { resetStationsForTests } from '../data/clients/stations';
import { deleteDbForTests } from '../data/cache/db';
import { resetMemoryDatasetStore } from '../data/cache/datasetStore';
import { loadSnapshots } from '../data/cache/snapshotStore';
import type { Place } from '../domain/types';
import type { WatchEntry } from '../domain/watch';
import { SNAPSHOT_MAX_PLACES, recordWatchSnapshots } from './snapshotRun';

// Lundi 28 septembre 2026, 15 h 27 locales.
const NOW = new Date('2026-09-28T13:27:00Z');
const STATIONS_URL = 'http://localhost:3000/data/stations-fr.json';
const POINT_URL = 'https://api.open-meteo.com/v1/forecast';

function place(id: string, latitude: number, longitude: number): Place {
  return { id, name: id, latitude, longitude, elevation: 200, admin: 'Rhône', alias: null };
}

function entry(p: Place): WatchEntry {
  return {
    place: p,
    department: null,
    rules: [],
    terrain: null,
    verification: [],
    preferred: null,
  };
}

const STATIONS = [
  { id: '07480', name: 'Lyon / Bron', latitude: 45.7167, longitude: 4.95, elevation: 200 },
  { id: '07481', name: 'Grenoble', latitude: 45.36, longitude: 5.33, elevation: 380 },
];

const LYON = place('lyon', 45.7578, 4.832);
const BRON = place('bron', 45.72, 4.93);
const GRENOBLE = place('grenoble', 45.18, 5.72);

/** Reponse au point de station : 13 heures a partir de 15 h, 22 °C pour AROME. */
function pointBody() {
  const time = Array.from(
    { length: 14 },
    (_, i) => `2026-09-28T${String(15 + i).padStart(2, '0')}:00`,
  ).filter((t) => t < '2026-09-29');
  // Sept modeles demandes : l'API suffixe chaque cle par l'identifiant du modele.
  return {
    hourly: { time, temperature_2m_meteofrance_arome_france_hd: time.map(() => 22) },
  };
}

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryDatasetStore();
  resetStationsForTests();
});

describe('recordWatchSnapshots', () => {
  it('enregistre un instantane par station, au point et a l altitude de la station', async () => {
    const urls: URL[] = [];
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json(STATIONS)),
      http.get(POINT_URL, ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(pointBody());
      }),
    );
    const recorded = await recordWatchSnapshots([entry(LYON)], NOW);
    expect(recorded).toBe(1);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.searchParams.get('latitude')).toBe('45.7167');
    expect(urls[0]?.searchParams.get('elevation')).toBe('200');

    const snapshots = await loadSnapshots('07480');
    expect(snapshots).toHaveLength(1);
    // 15 h 27 : relevee a 15 h, puis 16 h jusqu'a minuit (la serie s'arrete la).
    expect(snapshots[0]?.issuedAt).toBe('2026-09-28T15:00');
    expect(snapshots[0]?.timeline[0]).toBe('2026-09-28T16:00');
  });

  it('ne lit qu une fois une station partagee par deux lieux', async () => {
    let calls = 0;
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json(STATIONS)),
      http.get(POINT_URL, () => {
        calls += 1;
        return HttpResponse.json(pointBody());
      }),
    );
    expect(await recordWatchSnapshots([entry(LYON), entry(BRON)], NOW)).toBe(1);
    expect(calls).toBe(1);
  });

  it('ignore un lieu sans station representative, et un echec du service sans rien casser', async () => {
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json(STATIONS)),
      http.get(POINT_URL, () => new HttpResponse(null, { status: 500 })),
    );
    const far = place('mer', 43.0, 7.0);
    expect(await recordWatchSnapshots([entry(far), entry(LYON)], NOW)).toBe(0);
    expect(await loadSnapshots('07480')).toEqual([]);
  });

  it('se limite aux premiers lieux, pour menager le quota du service', async () => {
    const calls: string[] = [];
    const stations = Array.from({ length: SNAPSHOT_MAX_PLACES + 2 }, (_, i) => ({
      id: `S${i}`,
      name: `Station ${i}`,
      latitude: 45 + i * 0.5,
      longitude: 5,
      elevation: 200,
    }));
    server.use(
      http.get(STATIONS_URL, () => HttpResponse.json(stations)),
      http.get(POINT_URL, ({ request }) => {
        calls.push(new URL(request.url).searchParams.get('latitude') ?? '');
        return HttpResponse.json(pointBody());
      }),
    );
    const places = stations.map((s) => place(s.id, s.latitude, s.longitude));
    expect(await recordWatchSnapshots(places.map(entry), NOW)).toBe(SNAPSHOT_MAX_PLACES);
    expect(calls).toHaveLength(SNAPSHOT_MAX_PLACES);
  });

  it('rend 0 sans lieu veille, ou quand la liste des stations manque', async () => {
    expect(await recordWatchSnapshots([], NOW)).toBe(0);
    server.use(http.get(STATIONS_URL, () => new HttpResponse(null, { status: 404 })));
    expect(await recordWatchSnapshots([entry(GRENOBLE)], NOW)).toBe(0);
  });
});
