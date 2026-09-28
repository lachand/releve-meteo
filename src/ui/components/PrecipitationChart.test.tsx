import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hourlyPoint as makePoint } from '../../../tests/factories';
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
  return makePoint(time, {
    precipitation,
    windSpeed: 5,
    windGust: 10,
    radiation: 0,
    weatherCode: 61,
  });
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
  const cascade = useCascadeView(bundle, {
    terrain: null,
    verification: [],
    preferred: null,
    now: NOW,
  });
  if (cascade === null) {
    return null;
  }
  return <PrecipitationChart bundle={bundle} cascade={cascade} />;
}

describe('PrecipitationChart', () => {
  it('expose une table de donnees equivalente, en francais, avec modele et provenance', () => {
    const bundle = buildBundle();
    render(<Harness bundle={bundle} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName(/Précipitations horaires/);
    // Virgule decimale et provenance en francais, jamais un code anglais.
    expect(screen.getAllByText('3,5 mm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('prévu').length).toBeGreaterThan(1);
    expect(screen.queryByText('forecast')).not.toBeInTheDocument();
    expect(screen.getAllByText('AROME').length).toBeGreaterThan(0);
  });

  it('rend un canvas avec un libelle accessible', () => {
    const bundle = buildBundle();
    render(<Harness bundle={bundle} />);
    expect(screen.getByRole('img', { name: /Précipitations horaires/ })).toBeInTheDocument();
  });

  // Regression : la legende annoncait « observé » alors qu'aucune barre
  // n'est une mesure.
  it('ne legende que les provenances presentes', () => {
    const bundle = buildBundle();
    render(<Harness bundle={bundle} />);
    const legend = screen.getByRole('list', { name: 'Légende' });
    expect(legend).toHaveTextContent('prévu');
    expect(legend).not.toHaveTextContent('observé');
  });

  it('donne le cumul prevu sur la periode, sans compter un trou comme zero', () => {
    const bundle = buildBundle();
    render(<Harness bundle={bundle} />);
    expect(screen.getByText(/Cumul prévu/)).toHaveTextContent('Cumul prévu : 3,5 mm sur 6 h.');
  });
});
