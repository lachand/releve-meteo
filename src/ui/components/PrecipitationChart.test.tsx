import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place } from '../../domain/types';
import { useCascadeView } from '../hooks/useCascadeView';
import { PrecipitationChart } from './PrecipitationChart';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

function hourlyPoint(time: string, precipitation: number): HourlyPoint {
  const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });
  return {
    time,
    temperature: measure(14),
    precipitation: measure(precipitation),
    windSpeed: measure(5),
    windGust: measure(10),
    windDirection: measure(180),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(0),
    weatherCode: 61,
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
        hourly: timeline.map((t, i) => hourlyPoint(t, i === 2 ? 3.5 : 0)),
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
  return <PrecipitationChart bundle={bundle} cascade={cascade} />;
}

describe('PrecipitationChart', () => {
  it('expose une table de donnees equivalente avec la provenance de chaque mesure', () => {
    const bundle = buildBundle();
    render(<Harness bundle={bundle} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName(/Precipitations horaires/);
    expect(screen.getAllByText('3.5 mm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('forecast').length).toBeGreaterThan(0);
  });

  it('rend un canvas avec un libelle accessible', () => {
    const bundle = buildBundle();
    render(<Harness bundle={bundle} />);
    expect(screen.getByRole('img', { name: /Precipitations horaires/ })).toBeInTheDocument();
  });

  it('affiche la legende observe/prevu', () => {
    const bundle = buildBundle();
    render(<Harness bundle={bundle} />);
    expect(screen.getByText('observé')).toBeInTheDocument();
    expect(screen.getByText('prévu')).toBeInTheDocument();
  });
});
