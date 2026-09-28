import { describe, expect, it } from 'vitest';
import forecastRaw from '../../../tests/fixtures/live/forecast-lyon.json?raw';
import gridRaw from '../../../tests/fixtures/live/grid-lyon-arome.json?raw';
import meteostatDataUrl from '../../../tests/fixtures/live/meteostat-07480-2026.csv.gz?inline';
import { gridPoints } from '../../domain/grid';
import { MODEL_ORDER } from '../../domain/models';
import { leadHoursFrom } from '../../domain/time';
import type { Measure, Place, Provenance } from '../../domain/types';
import { mapForecastGrid } from '../clients/forecastGrid';
import { parseStationRecords } from '../clients/meteostat';
import { mapOpenMeteoResponse } from './openMeteoMapper';
import type { RawForecastResponse } from '../clients/openMeteo';

/*
 * Attribution de provenance, garantie transverse (TESTING.md 3.4) : sur de
 * vraies reponses (Lyon, 28 septembre 2026 a 13h27 UTC), aucune mesure n'a
 * une provenance absente ou incoherente avec sa position dans le temps.
 * Un modele ne produit jamais 'observed' ; une station ne produit que
 * 'observed' ; une carte de prevision que 'forecast'.
 */

const NOW = new Date('2026-09-28T13:27:00Z');
const PROVENANCES: readonly Provenance[] = ['observed', 'estimated', 'forecast'];

const LYON: Place = {
  id: '45.7485:4.8467',
  name: 'Lyon',
  latitude: 45.74846,
  longitude: 4.84671,
  elevation: 170,
  admin: 'Rhône',
  alias: null,
};

function isMeasure(value: unknown): value is Measure {
  return typeof value === 'object' && value !== null && 'provenance' in value && 'value' in value;
}

/** Toutes les mesures d'un objet, avec le nom de leur champ. */
function measuresOf(point: object): [string, Measure][] {
  return Object.entries(point).filter((entry): entry is [string, Measure] => isMeasure(entry[1]));
}

async function gunzip(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const stream = new Response(bytes).body?.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

describe('attribution de provenance sur des reponses reelles', () => {
  const mapped = mapOpenMeteoResponse({
    place: LYON,
    requestedModels: MODEL_ORDER,
    response: JSON.parse(forecastRaw) as RawForecastResponse,
    now: NOW,
    fetchedAt: NOW.getTime(),
  });

  it('la prevision de chaque modele est estimee dans le passe, prevue ensuite, jamais observee', () => {
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const { bundle } = mapped.value;
    let checked = 0;
    for (const model of MODEL_ORDER) {
      const series = bundle.series[model];
      expect(series, model).toBeDefined();
      for (const point of series?.hourly ?? []) {
        const expected: Provenance = leadHoursFrom(NOW, point.time) < 0 ? 'estimated' : 'forecast';
        for (const [field, measure] of measuresOf(point)) {
          expect(PROVENANCES, `${model} ${point.time} ${field}`).toContain(measure.provenance);
          expect(measure.provenance, `${model} ${point.time} ${field}`).toBe(expected);
          checked += 1;
        }
      }
      for (const day of series?.daily ?? []) {
        const expected: Provenance =
          leadHoursFrom(NOW, `${day.date}T12:00`) < 0 ? 'estimated' : 'forecast';
        for (const [field, measure] of measuresOf(day)) {
          expect(measure.provenance, `${model} ${day.date} ${field}`).toBe(expected);
          checked += 1;
        }
      }
    }
    // Garde-fou : le parcours a bien porte sur tout le bundle.
    expect(checked).toBeGreaterThan(10000);
  });

  it('un releve de station n est jamais que mesure', async () => {
    const csv = await gunzip(meteostatDataUrl);
    const records = parseStationRecords(csv, NOW.getTime() - 36 * 60 * 60 * 1000);
    expect(records.length).toBeGreaterThan(10);
    for (const record of records) {
      for (const [field, measure] of measuresOf(record)) {
        expect(measure.provenance, `${record.time} ${field}`).toBe('observed');
      }
      // Les valeurs prevues (MOSMIX) melees au fichier sont ecartees : aucune
      // heure future ne peut y figurer.
      expect(leadHoursFrom(NOW, record.time)).toBeLessThanOrEqual(0);
    }
  });

  it('une carte de prevision n est que prevue', () => {
    const result = mapForecastGrid({
      raw: JSON.parse(gridRaw) as unknown,
      points: gridPoints(LYON),
      model: 'arome',
      stepKm: 12.5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provenance).toBe('forecast');
  });
});
