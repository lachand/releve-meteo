import { describe, expect, it } from 'vitest';
import { TEST_PLACE, buildBundle, buildHourlyTimeline } from '../../../tests/factories';
import { snapshotOf } from './useFavouriteSnapshots';

// 15 h 27 locale : l'heure de 16 h est la premiere a venir.
const NOW = new Date('2026-09-28T13:27:00Z');
const TIMELINE = buildHourlyTimeline('2026-09-28T00:00', 72);

describe('snapshotOf', () => {
  const bundle = buildBundle({
    timeline: TIMELINE,
    models: ['arome', 'ecmwf'],
    values: (model) => ({ temperature: model === 'arome' ? 21.4 : 19 }),
  });

  it('donne la valeur du moment selon le modele que retiendrait la page du lieu', () => {
    const snapshot = snapshotOf({
      place: TEST_PLACE,
      bundle,
      verification: [],
      preferred: null,
      now: NOW,
    });
    expect(snapshot.status).toBe('ready');
    if (snapshot.status !== 'ready') return;
    // Maille la plus fine pour l'heure qui vient : AROME.
    expect(snapshot.model).toBe('arome');
    expect(snapshot.point?.time).toBe('2026-09-28T16:00');
    expect(snapshot.point?.temperature.value).toBe(21.4);
    expect(snapshot.manual).toBe(false);
  });

  it('joint le resume des 24 heures a venir, calcule sur le meme modele retenu', () => {
    const snapshot = snapshotOf({
      place: TEST_PLACE,
      bundle,
      verification: [],
      preferred: null,
      now: NOW,
    });
    expect(snapshot.status === 'ready' && snapshot.digest).toMatchObject({
      tempMin: 21.4,
      tempMax: 21.4,
    });
  });

  it('respecte le choix manuel enregistre pour ce lieu, et le signale', () => {
    const snapshot = snapshotOf({
      place: TEST_PLACE,
      bundle,
      verification: [],
      preferred: 'ecmwf',
      now: NOW,
    });
    expect(snapshot.status === 'ready' && snapshot.model).toBe('ecmwf');
    expect(snapshot.status === 'ready' && snapshot.point?.temperature.value).toBe(19);
    expect(snapshot.status === 'ready' && snapshot.manual).toBe(true);
  });

  it("rend un apercu sans valeur quand aucun modele ne couvre l'instant present", () => {
    const snapshot = snapshotOf({
      place: TEST_PLACE,
      bundle: buildBundle({
        timeline: buildHourlyTimeline('2026-09-27T00:00', 12),
        models: ['arome'],
      }),
      verification: [],
      preferred: null,
      now: NOW,
    });
    expect(snapshot).toMatchObject({ status: 'ready', model: null, point: null, digest: null });
  });
});
