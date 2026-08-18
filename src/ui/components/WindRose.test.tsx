import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place } from '../../domain/types';
import { useCascadeView } from '../hooks/useCascadeView';
import { WindRose } from './WindRose';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

function hourlyPoint(time: string, windDirection: number): HourlyPoint {
  const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });
  return {
    time,
    temperature: measure(14),
    precipitation: measure(0),
    windSpeed: measure(10),
    windGust: measure(20),
    windDirection: measure(windDirection),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(0),
    weatherCode: 1,
  };
}

function buildBundle(): ForecastBundle {
  const timeline = Array.from({ length: 4 }, (_, i) => `2026-08-17T0${i}:00`);
  return {
    place,
    fetchedAt: 0,
    timeline,
    series: {
      arome: {
        model: 'arome',
        hourly: timeline.map((t) => hourlyPoint(t, 90)),
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
  return <WindRose bundle={bundle} cascade={cascade} />;
}

describe('WindRose', () => {
  it('rend un canvas avec un libelle accessible', () => {
    render(<Harness bundle={buildBundle()} />);
    expect(screen.getByRole('img', { name: /Rose des vents/ })).toBeInTheDocument();
  });

  it('expose une table de donnees equivalente avec un secteur E domine', () => {
    render(<Harness bundle={buildBundle()} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName(/Repartition de la direction du vent/);
    const row = screen.getByText('E').closest('tr');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('4');
  });
});
