import { render, screen, within } from '@testing-library/react';
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
    humidity: measure(65),
    apparentTemperature: measure(13),
    precipitationProbability: measure(null),
    snowfall: measure(0),
    cape: measure(0),
    visibility: measure(20000),
    freezingLevel: measure(3000),
    weatherCode: 1,
    isDay: true,
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

function Harness({
  bundle,
  windUnit,
}: {
  readonly bundle: ForecastBundle;
  readonly windUnit?: 'kmh' | 'kt';
}) {
  const cascade = useCascadeView(bundle, {
    terrain: null,
    verification: [],
    preferred: null,
    now: NOW,
  });
  if (cascade === null) {
    return null;
  }
  return <WindRose bundle={bundle} cascade={cascade} windUnit={windUnit} />;
}

describe('WindRose', () => {
  it('dessine la rose en SVG, avec sa synthese comme nom accessible', () => {
    render(<Harness bundle={buildBundle()} />);
    expect(
      screen.getByRole('img', {
        name: 'Rose des vents sur 48 heures. Vent dominant d’est : 4 heures sur 4, surtout faible.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Vent dominant d’est : 4 heures sur 4, surtout faible.'),
    ).toBeInTheDocument();
  });

  it('un seul petale, a l est, dans la classe du vent faible', () => {
    const { container } = render(<Harness bundle={buildBundle()} />);
    const petals = container.querySelectorAll('path[data-class]');
    expect(petals).toHaveLength(1);
    expect(petals[0]).toHaveAttribute('data-class', 'light');
  });

  it('explique la lecture et nomme le modele des heures', () => {
    render(<Harness bundle={buildBundle()} />);
    expect(screen.getByText(/Chaque pétale pointe d’où vient le vent/)).toHaveTextContent(
      'Heures du modèle retenu : AROME.',
    );
  });

  it('donne les seuils de force dans l unite choisie', () => {
    render(<Harness bundle={buildBundle()} windUnit="kt" />);
    const legend = within(screen.getByRole('list', { name: 'Force du vent' }));
    expect(legend.getByText('faible, moins de 11 kt')).toBeInTheDocument();
    expect(legend.getByText('très fort, 32 kt et plus')).toBeInTheDocument();
  });

  it('expose une table equivalente, par direction et par force', () => {
    render(<Harness bundle={buildBundle()} />);
    const table = screen.getByRole('table', { name: /Répartition de la direction du vent/ });
    const row = within(table).getByRole('rowheader', { name: 'E' }).closest('tr');
    expect(row?.textContent).toBe('E40004');
    expect(within(table).getByRole('rowheader', { name: 'Calme' })).toBeInTheDocument();
  });
});
