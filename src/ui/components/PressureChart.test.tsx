import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place } from '../../domain/types';
import { useCascadeView } from '../hooks/useCascadeView';
import { PressureChart } from './PressureChart';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

function hourlyPoint(time: string, pressure: number): HourlyPoint {
  const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });
  return {
    time,
    temperature: measure(14),
    precipitation: measure(0),
    windSpeed: measure(5),
    windGust: measure(10),
    windDirection: measure(180),
    pressure: measure(pressure),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(0),
    weatherCode: 1,
  };
}

function buildBundle(): ForecastBundle {
  const timeline = Array.from({ length: 6 }, (_, i) => `2026-08-17T0${i}:00`);
  return {
    place,
    fetchedAt: 0,
    timeline,
    series: {
      arome: {
        model: 'arome',
        hourly: timeline.map((t, i) => hourlyPoint(t, 1010 + i)),
        daily: [],
      },
    },
  };
}

const NOW = new Date('2026-08-16T23:30:00+02:00');

function Harness({ bundle }: { readonly bundle: ForecastBundle }) {
  const cascade = useCascadeView(bundle, NOW);
  if (cascade === null) {
    return null;
  }
  return <PressureChart bundle={bundle} cascade={cascade} />;
}

describe('PressureChart', () => {
  it('rend un canvas avec un libelle accessible', () => {
    render(<Harness bundle={buildBundle()} />);
    expect(
      screen.getByRole('img', { name: /Pression atmospherique sur 72 heures/ }),
    ).toBeInTheDocument();
  });

  it('expose une table de donnees equivalente', () => {
    render(<Harness bundle={buildBundle()} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName(/Pression atmospherique horaire/);
    expect(screen.getAllByText('1010 hPa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AROME').length).toBeGreaterThan(0);
  });
});
