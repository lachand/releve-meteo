import { describe, expect, it } from 'vitest';
import aromeMissing from '../../../tests/fixtures/arome-missing.json';
import aromeTruncated from '../../../tests/fixtures/arome-truncated.json';
import dstAutumn from '../../../tests/fixtures/dst-autumn.json';
import dstSpring from '../../../tests/fixtures/dst-spring.json';
import malformedLengths from '../../../tests/fixtures/malformed-lengths.json';
import nominalSummer from '../../../tests/fixtures/nominal-summer.json';
import type { Place } from '../../domain/types';
import type { RawForecastResponse } from '../clients/openMeteo';
import { mapOpenMeteoResponse } from './openMeteoMapper';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const NOW = new Date('2026-08-17T00:00:00+02:00');

function map(
  response: unknown,
  requestedModels: readonly ('arome' | 'arpege' | 'icon_eu' | 'gfs')[],
  now = NOW,
) {
  return mapOpenMeteoResponse({
    place,
    requestedModels,
    response: response as RawForecastResponse,
    now,
    fetchedAt: now.getTime(),
  });
}

describe('mapOpenMeteoResponse', () => {
  it('produit 4 series sur une timeline commune de longueurs identiques', () => {
    const result = map(nominalSummer, ['arome', 'arpege', 'icon_eu', 'gfs']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { bundle, missingModels } = result.value;
    expect(missingModels).toEqual([]);
    expect(Object.keys(bundle.series)).toEqual(['arome', 'arpege', 'icon_eu', 'gfs']);
    for (const model of ['arome', 'arpege', 'icon_eu', 'gfs'] as const) {
      expect(bundle.series[model]?.hourly).toHaveLength(bundle.timeline.length);
    }
  });

  it('resout correctement la cle de variable suffixee par le modele', () => {
    const result = map(nominalSummer, ['arome', 'arpege', 'icon_eu', 'gfs']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const aromeFirstTemp = result.value.bundle.series.arome?.hourly[0]?.temperature.value;
    expect(typeof aromeFirstTemp).toBe('number');
  });

  it('AROME tronque : null au-dela de son echeance, meme longueur que la timeline', () => {
    const result = map(aromeTruncated, ['arome', 'arpege', 'icon_eu', 'gfs']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const arome = result.value.bundle.series.arome;
    expect(arome?.hourly).toHaveLength(result.value.bundle.timeline.length);
    expect(arome?.hourly[3]?.temperature.value).not.toBeNull();
    expect(arome?.hourly[4]?.temperature.value).toBeNull();
    expect(arome?.hourly[5]?.temperature.value).toBeNull();
  });

  it('un null dans les precipitations reste null, jamais converti en 0', () => {
    const result = map(aromeTruncated, ['arome', 'arpege', 'icon_eu', 'gfs']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bundle.series.arome?.hourly[5]?.precipitation.value).toBeNull();
  });

  it('un modele demande absent du payload est liste dans missingModels, bundle construit sans lui', () => {
    const result = map(aromeMissing, ['arome', 'arpege', 'icon_eu', 'gfs']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.missingModels).toEqual(['arome']);
    expect(result.value.bundle.series.arome).toBeUndefined();
    expect(result.value.bundle.series.arpege).toBeDefined();
  });

  it("echoue en malformed si le payload n'a pas de bloc hourly", () => {
    const result = map({ latitude: 1, longitude: 1 }, ['arome']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('echoue en malformed sur des longueurs de tableaux incoherentes, pas de bundle partiel', () => {
    const result = map(malformedLengths, ['arome', 'arpege']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('marque les points passes estimated et les points futurs forecast', () => {
    // now cale entre le 3e et le 4e point de la fixture nominal-summer (0h a 5h).
    const now = new Date('2026-08-17T02:30:00+02:00');
    const result = map(nominalSummer, ['arome', 'arpege', 'icon_eu', 'gfs'], now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hourly = result.value.bundle.series.arome?.hourly ?? [];
    expect(hourly[0]?.temperature.provenance).toBe('estimated');
    expect(hourly[2]?.temperature.provenance).toBe('estimated');
    expect(hourly[3]?.temperature.provenance).toBe('forecast');
    expect(hourly[5]?.temperature.provenance).toBe('forecast');
  });

  it('detecte le saut du printemps sans point perdu ni duplique', () => {
    const result = map(dstSpring, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bundle.timeline).toEqual([
      '2026-03-28T22:00',
      '2026-03-28T23:00',
      '2026-03-29T00:00',
      '2026-03-29T01:00',
      '2026-03-29T03:00',
      '2026-03-29T04:00',
    ]);
    expect(result.value.bundle.series.arome?.hourly).toHaveLength(6);
  });

  it("detecte l'heure repetee de l'automne sans point perdu", () => {
    const result = map(dstAutumn, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bundle.timeline).toHaveLength(6);
    expect(result.value.bundle.series.arome?.hourly).toHaveLength(6);
  });

  it('ne suffixe pas les cles quand un seul modele est demande', () => {
    const singleModelResponse = {
      latitude: 1,
      longitude: 1,
      elevation: 0,
      timezone: 'Europe/Paris',
      utc_offset_seconds: 7200,
      hourly: {
        time: ['2026-08-17T00:00', '2026-08-17T01:00'],
        temperature_2m: [10, 11],
        precipitation: [0, 0],
        wind_speed_10m: [5, 5],
        wind_gusts_10m: [10, 10],
        wind_direction_10m: [180, 180],
        pressure_msl: [1013, 1013],
        dew_point_2m: [8, 8],
        cloud_cover: [50, 50],
        shortwave_radiation: [100, 100],
        weather_code: [1, 1],
      },
    };
    const result = map(singleModelResponse, ['arome']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bundle.series.arome?.hourly[0]?.temperature.value).toBe(10);
  });

  it('laisse une variable a null quand sa cle est absente pour un modele present', () => {
    const { wind_gusts_10m, ...hourlyWithoutGusts } = {
      time: ['2026-08-17T00:00', '2026-08-17T01:00'],
      temperature_2m: [10, 11],
      precipitation: [0, 0],
      wind_speed_10m: [5, 5],
      wind_gusts_10m: [10, 10],
      wind_direction_10m: [180, 180],
      pressure_msl: [1013, 1013],
      dew_point_2m: [8, 8],
      cloud_cover: [50, 50],
      shortwave_radiation: [100, 100],
      weather_code: [1, 1],
    };
    const result = map(
      {
        latitude: 1,
        longitude: 1,
        elevation: 0,
        timezone: 'Europe/Paris',
        utc_offset_seconds: 7200,
        hourly: hourlyWithoutGusts,
      },
      ['arome'],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bundle.series.arome?.hourly[0]?.windGust.value).toBeNull();
    expect(result.value.bundle.series.arome?.hourly[0]?.temperature.value).toBe(10);
  });

  it('echoue en malformed sur une longueur incoherente de weather_code', () => {
    const result = map(
      {
        latitude: 1,
        longitude: 1,
        elevation: 0,
        timezone: 'Europe/Paris',
        utc_offset_seconds: 7200,
        hourly: {
          time: ['2026-08-17T00:00', '2026-08-17T01:00'],
          temperature_2m: [10, 11],
          precipitation: [0, 0],
          wind_speed_10m: [5, 5],
          wind_gusts_10m: [10, 10],
          wind_direction_10m: [180, 180],
          pressure_msl: [1013, 1013],
          dew_point_2m: [8, 8],
          cloud_cover: [50, 50],
          shortwave_radiation: [100, 100],
          weather_code: [1],
        },
      },
      ['arome'],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('echoue en malformed sur une longueur incoherente dans le bloc daily', () => {
    const result = map(
      {
        latitude: 1,
        longitude: 1,
        elevation: 0,
        timezone: 'Europe/Paris',
        utc_offset_seconds: 7200,
        hourly: {
          time: ['2026-08-17T00:00'],
          temperature_2m: [10],
          precipitation: [0],
          wind_speed_10m: [5],
          wind_gusts_10m: [10],
          wind_direction_10m: [180],
          pressure_msl: [1013],
          dew_point_2m: [8],
          cloud_cover: [50],
          shortwave_radiation: [100],
          weather_code: [1],
        },
        daily: {
          time: ['2026-08-17', '2026-08-18'],
          temperature_2m_max: [22],
          temperature_2m_min: [12, 11],
          precipitation_sum: [0, 0],
          uv_index_max: [5, 5],
          weather_code: [1, 1],
          sunrise: ['2026-08-17T06:30', '2026-08-18T06:31'],
          sunset: ['2026-08-17T21:00', '2026-08-18T20:59'],
        },
      },
      ['arome'],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('laisse une valeur quotidienne a null quand elle est explicitement absente', () => {
    const result = map(
      {
        latitude: 1,
        longitude: 1,
        elevation: 0,
        timezone: 'Europe/Paris',
        utc_offset_seconds: 7200,
        hourly: {
          time: ['2026-08-17T00:00'],
          temperature_2m: [10],
          precipitation: [0],
          wind_speed_10m: [5],
          wind_gusts_10m: [10],
          wind_direction_10m: [180],
          pressure_msl: [1013],
          dew_point_2m: [8],
          cloud_cover: [50],
          shortwave_radiation: [100],
          weather_code: [1],
        },
        daily: {
          time: ['2026-08-17', '2026-08-18'],
          temperature_2m_max: [22, null],
          temperature_2m_min: [12, 11],
          precipitation_sum: [0, 0],
          uv_index_max: [5, 5],
          weather_code: [1, null],
          sunrise: ['2026-08-17T06:30', null],
          sunset: ['2026-08-17T21:00', null],
        },
      },
      ['arome'],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const daily = result.value.bundle.series.arome?.daily;
    expect(daily?.[1]?.tempMax.value).toBeNull();
    expect(daily?.[1]?.sunrise).toBeNull();
    expect(daily?.[1]?.sunset).toBeNull();
    expect(daily?.[1]?.weatherCode).toBeNull();
  });
});
