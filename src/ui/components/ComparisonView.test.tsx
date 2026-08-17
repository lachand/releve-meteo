import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ForecastBundle, HourlyPoint, Place } from '../../domain/types';
import { ComparisonView } from './ComparisonView';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

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

function buildBundle(): ForecastBundle {
  const timeline = Array.from({ length: 4 }, (_, i) => `2026-08-17T0${i}:00`);
  return {
    place,
    fetchedAt: 0,
    timeline,
    series: {
      arome: { model: 'arome', hourly: timeline.map((_, i) => point(14 + i)), daily: [] },
      arpege: { model: 'arpege', hourly: timeline.map((_, i) => point(20 + i)), daily: [] },
    },
  };
}

describe('ComparisonView', () => {
  it('affiche la legende avec un modele par ligne et sa portee', () => {
    const bundle = buildBundle();
    render(<ComparisonView bundle={bundle} nowIndex={0} onClose={vi.fn()} />);
    expect(screen.getByText(/AROME jusqu'à 36 h/)).toBeInTheDocument();
    expect(screen.getByText(/ARPEGE jusqu'à 96 h/)).toBeInTheDocument();
  });

  it("calcule l'ecart maximal entre modeles dans le texte de synthese", () => {
    const bundle = buildBundle();
    render(<ComparisonView bundle={bundle} nowIndex={0} onClose={vi.fn()} />);
    // arome=14, arpege=20 au premier point : ecart de 6.
    expect(screen.getByText(/Écart maximal 6,?\.?0? °C/)).toBeInTheDocument();
  });

  it('appelle onClose au clic sur fermer', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const bundle = buildBundle();
    render(<ComparisonView bundle={bundle} nowIndex={0} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('change de variable via le selecteur', async () => {
    const user = userEvent.setup();
    const bundle = buildBundle();
    render(<ComparisonView bundle={bundle} nowIndex={0} onClose={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Variable'), 'wind');
    expect(screen.getByRole('img', { name: /Vent comparée/ })).toBeInTheDocument();
  });

  it('expose une table de donnees equivalente par modele', () => {
    const bundle = buildBundle();
    render(<ComparisonView bundle={bundle} nowIndex={0} onClose={vi.fn()} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName(/Température par modèle/);
  });
});
