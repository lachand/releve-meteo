import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ForecastBundle, HourlyPoint, ModelId, Place } from '../../domain/types';
import { useCascadeView } from '../hooks/useCascadeView';
import { useConfidenceView } from '../hooks/useConfidenceView';
import { Timeline48h } from './Timeline48h';

const place: Place = {
  id: '45.4900:5.4700',
  name: 'Val de Virieu',
  latitude: 45.49,
  longitude: 5.47,
  elevation: 468,
  admin: 'Isère',
  alias: null,
};

const plain = { kind: 'plain' as const, elevation: 200, distanceToCoastKm: 100 };

function hourlyPoint(time: string, temperature: number, weatherCode = 1): HourlyPoint {
  const measure = (value: number | null) => ({ value, provenance: 'forecast' as const });
  return {
    time,
    temperature: measure(temperature),
    precipitation: measure(0),
    windSpeed: measure(5),
    windGust: measure(10),
    windDirection: measure(180),
    pressure: measure(1013),
    dewPoint: measure(8),
    cloudCover: measure(50),
    radiation: measure(0),
    weatherCode,
  };
}

function buildBundle(models: readonly ModelId[] = ['arome']): ForecastBundle {
  const timeline = Array.from({ length: 6 }, (_, i) => `2026-08-17T0${i}:00`);
  const series: ForecastBundle['series'] = {};
  for (const model of models) {
    series[model] = { model, hourly: timeline.map((t, i) => hourlyPoint(t, 14 + i)), daily: [] };
  }
  return { place, fetchedAt: 0, timeline, series };
}

const NOW = new Date('2026-08-16T23:30:00+02:00');

function CascadeHarness({ bundle }: { readonly bundle: ForecastBundle }) {
  const cascade = useCascadeView(bundle, NOW);
  const confidence = useConfidenceView(bundle, plain);
  if (cascade === null) {
    return null;
  }
  return <Timeline48h bundle={bundle} cascade={cascade} confidence={confidence} />;
}

describe('Timeline48h', () => {
  it("expose une table de donnees equivalente pour les lecteurs d'ecran", () => {
    const bundle = buildBundle();
    render(<CascadeHarness bundle={bundle} />);
    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName(/Temperature horaire/);
    expect(screen.getAllByText('AROME').length).toBeGreaterThan(0);
  });

  it('inclut la condition meteo dans la table accessible', () => {
    const bundle = buildBundle();
    render(<CascadeHarness bundle={bundle} />);
    expect(screen.getByText('Condition')).toBeInTheDocument();
    expect(screen.getAllByText('Peu nuageux').length).toBeGreaterThan(0);
  });

  it("inclut la confiance et l'ecart inter-modeles dans la table accessible", () => {
    const bundle = buildBundle(['arome', 'arpege']);
    render(<CascadeHarness bundle={bundle} />);
    expect(screen.getByText('Confiance')).toBeInTheDocument();
    expect(screen.getByText('Ecart inter-modeles')).toBeInTheDocument();
  });

  it('rend un canvas avec un libelle accessible', () => {
    const bundle = buildBundle();
    render(<CascadeHarness bundle={bundle} />);
    expect(screen.getByRole('img', { name: /Temperature sur 48 heures/ })).toBeInTheDocument();
  });

  it('affiche la legende permanente de texture et de hachure', () => {
    const bundle = buildBundle();
    render(<CascadeHarness bundle={bundle} />);
    expect(screen.getByText('confiance élevée')).toBeInTheDocument();
    expect(screen.getByText('confiance moyenne')).toBeInTheDocument();
    expect(screen.getByText('confiance faible')).toBeInTheDocument();
    expect(screen.getByText('écart entre modèles')).toBeInTheDocument();
  });
});
