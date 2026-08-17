import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place, TerrainProfile } from '../../domain/types';
import { useConfidenceView } from './useConfidenceView';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const plain: TerrainProfile = { kind: 'plain', elevation: 200, distanceToCoastKm: 100 };

function point(temperature: number): HourlyPoint {
  const measure = (value: number) => ({ value, provenance: 'forecast' as const });
  return {
    time: '2026-08-17T14:00',
    temperature: measure(temperature),
    precipitation: measure(0),
    windSpeed: measure(10),
    windGust: measure(20),
    windDirection: measure(180),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(200),
    weatherCode: 1,
  };
}

describe('useConfidenceView', () => {
  it('retourne null sans bundle', () => {
    const { result } = renderHook(() => useConfidenceView(null, plain));
    expect(result.current).toBeNull();
  });

  it('retourne un verdict par index de timeline', () => {
    const bundle: ForecastBundle = {
      place,
      fetchedAt: 0,
      timeline: ['2026-08-17T14:00', '2026-08-17T15:00'],
      series: {
        arome: { model: 'arome', hourly: [point(14), point(20)], daily: [] },
        arpege: { model: 'arpege', hourly: [point(14.5), point(14.2)], daily: [] },
      },
    };
    const { result } = renderHook(() => useConfidenceView(bundle, plain));
    expect(result.current).toHaveLength(2);
    expect(result.current?.[0]?.level).toBe('high');
    expect(result.current?.[1]?.level).toBe('low');
  });
});
