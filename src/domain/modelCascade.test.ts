import { describe, expect, it } from 'vitest';
import {
  buildCascade,
  blendByCascade,
  selectModelForLeadTime,
  transitionIndices,
} from './modelCascade';
import type { ForecastBundle, ModelId, Place } from './types';

const ALL_MODELS: readonly ModelId[] = ['arome', 'arpege', 'icon_eu', 'gfs'];

describe('selectModelForLeadTime', () => {
  it('choisit arome a echeance 0h avec tous les modeles', () => {
    expect(selectModelForLeadTime(0, ALL_MODELS)).toBe('arome');
  });

  it('choisit arome a echeance 36h exactement, borne incluse', () => {
    expect(selectModelForLeadTime(36, ALL_MODELS)).toBe('arome');
  });

  it('choisit arpege a echeance 36.01h', () => {
    expect(selectModelForLeadTime(36.01, ALL_MODELS)).toBe('arpege');
  });

  it('choisit arpege a echeance 96h exactement', () => {
    expect(selectModelForLeadTime(96, ALL_MODELS)).toBe('arpege');
  });

  it('choisit icon_eu a echeance 96.01h', () => {
    expect(selectModelForLeadTime(96.01, ALL_MODELS)).toBe('icon_eu');
  });

  it('choisit icon_eu a echeance 168h exactement', () => {
    expect(selectModelForLeadTime(168, ALL_MODELS)).toBe('icon_eu');
  });

  it('ne choisit aucun modele au dela de 168h', () => {
    expect(selectModelForLeadTime(168.01, ALL_MODELS)).toBeNull();
  });

  it('replie sur arpege a 12h si AROME est absent, jamais un modele plus fin', () => {
    expect(selectModelForLeadTime(12, ['arpege', 'icon_eu', 'gfs'])).toBe('arpege');
  });

  it('replie sur gfs a 12h si seul gfs est disponible', () => {
    expect(selectModelForLeadTime(12, ['gfs'])).toBe('gfs');
  });

  it("retourne null si aucun modele n'est disponible", () => {
    expect(selectModelForLeadTime(12, [])).toBeNull();
  });

  it('retourne null pour une echeance negative', () => {
    expect(selectModelForLeadTime(-1, ALL_MODELS)).toBeNull();
  });
});

function buildHourlyTimeline(startIso: string, count: number): string[] {
  const timeline: string[] = [];
  const [datePart, timePart] = startIso.split('T');
  const [y, m, d] = (datePart ?? '').split('-').map(Number);
  const [h] = (timePart ?? '').split(':').map(Number);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1, (h ?? 0) + i));
    const iso = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}:00`;
    timeline.push(iso);
  }
  return timeline;
}

describe('buildCascade', () => {
  it('decoupe 168 points en segments contigus, ordonnes, sans chevauchement', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 168);
    const now = new Date('2026-08-16T22:00:00Z');
    const segments = buildCascade(timeline, now, ALL_MODELS);

    expect(segments.length).toBeGreaterThan(0);
    for (let i = 1; i < segments.length; i += 1) {
      const previous = segments[i - 1];
      const current = segments[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous !== undefined && current !== undefined) {
        expect(current.startIndex).toBe(previous.endIndex + 1);
      }
    }
    const last = segments.at(-1);
    expect(last?.endIndex).toBe(timeline.length - 1);
  });

  it('omet les points passes, anterieurs a now', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 10);
    // now cale 3h apres le debut de la timeline : les 3 premiers points sont passes.
    const now = new Date('2026-08-17T01:00:00Z');
    const segments = buildCascade(timeline, now, ALL_MODELS);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.startIndex).toBe(3);
  });

  it('produit un seul segment ARPEGE quand AROME est absent, sans segment vide', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 96);
    const now = new Date('2026-08-16T22:00:00Z');
    const segments = buildCascade(timeline, now, ['arpege', 'icon_eu', 'gfs']);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.model).toBe('arpege');
    expect(segments.every((segment) => segment.startIndex <= segment.endIndex)).toBe(true);
  });
});

describe('transitionIndices', () => {
  it('compte exactement 2 transitions sur une cascade complete', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 168);
    const now = new Date('2026-08-16T22:00:00Z');
    const segments = buildCascade(timeline, now, ALL_MODELS);
    expect(transitionIndices(segments)).toHaveLength(2);
  });
});

describe('blendByCascade', () => {
  const place: Place = {
    id: '45.4936:5.4708',
    name: 'Val de Virieu',
    latitude: 45.4936,
    longitude: 5.4708,
    elevation: 468,
    admin: 'Isere',
    alias: null,
  };

  it('porte le modele du segment correspondant sur chaque point', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 48);
    const now = new Date('2026-08-16T22:00:00Z');
    const measure = { value: 14, provenance: 'forecast' as const };
    const hourlyPoint = (time: string) => ({
      time,
      temperature: measure,
      precipitation: measure,
      windSpeed: measure,
      windGust: measure,
      windDirection: measure,
      pressure: measure,
      dewPoint: measure,
      cloudCover: measure,
      radiation: measure,
      weatherCode: null,
    });
    const bundle: ForecastBundle = {
      place,
      fetchedAt: now.getTime(),
      timeline,
      series: {
        arome: { model: 'arome', hourly: timeline.map(hourlyPoint), daily: [] },
        arpege: { model: 'arpege', hourly: timeline.map(hourlyPoint), daily: [] },
      },
    };
    const segments = buildCascade(timeline, now, ['arome', 'arpege']);
    const blended = blendByCascade(bundle, segments);

    expect(blended).toHaveLength(timeline.length);
    for (const segment of segments) {
      for (let i = segment.startIndex; i <= segment.endIndex; i += 1) {
        expect(blended[i]?.model).toBe(segment.model);
      }
    }
  });

  it("ignore un index au-dela de la longueur reelle de la serie, si l'invariant de timeline commune est viole", () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 4);
    const measure = { value: 14, provenance: 'forecast' as const };
    const shortHourly = [
      {
        time: timeline[0] as string,
        temperature: measure,
        precipitation: measure,
        windSpeed: measure,
        windGust: measure,
        windDirection: measure,
        pressure: measure,
        dewPoint: measure,
        cloudCover: measure,
        radiation: measure,
        weatherCode: null,
      },
    ];
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline,
      series: { arome: { model: 'arome', hourly: shortHourly, daily: [] } },
    };
    const segments = [{ model: 'arome' as const, startIndex: 0, endIndex: 3 }];

    expect(blendByCascade(bundle, segments)).toHaveLength(1);
  });

  it('ignore un segment dont le modele est absent du bundle', () => {
    const timeline = buildHourlyTimeline('2026-08-17T00:00', 4);
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline,
      series: {},
    };
    const segments = [{ model: 'arome' as const, startIndex: 0, endIndex: 3 }];

    expect(blendByCascade(bundle, segments)).toHaveLength(0);
  });
});
