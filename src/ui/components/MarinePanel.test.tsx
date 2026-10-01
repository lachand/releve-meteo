import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { waveOutlook } from '../../domain/marine';
import type { MarineHourly } from '../../domain/marine';
import type { DatasetState } from '../hooks/useDataset';
import { MarinePanel } from './MarinePanel';

// 10 h 12 locales le 28 septembre 2026.
const NOW = new Date('2026-09-28T08:12:00Z');
const timeline = Array.from(
  { length: 30 },
  (_, i) => `2026-09-${28 + Math.floor((8 + i) / 24)}T${String((8 + i) % 24).padStart(2, '0')}:00`,
) as MarineHourly['timeline'];
const SERIES: MarineHourly = {
  timeline,
  waveHeight: timeline.map((_, i) => (i === 7 ? null : 0.5 + (i % 5) * 0.4)),
  wavePeriod: timeline.map(() => 8),
  waveDirection: timeline.map(() => 270),
};

function ready(value: MarineHourly): DatasetState<MarineHourly> {
  return { status: 'ready', value, fetchedAt: 0, stale: false };
}

describe('MarinePanel', () => {
  it('dit l etat de la mer, le pic, et donne les vagues toutes les trois heures', () => {
    const outlook = waveOutlook({ series: SERIES, now: NOW });
    render(<MarinePanel state={ready(SERIES)} outlook={outlook} />);
    expect(screen.getByText(/^Mer (belle|agitée|ridée)/)).toBeInTheDocument();
    expect(screen.getByText(/^Pic des 48.prochaines heures/)).toBeInTheDocument();
    const table = within(screen.getByRole('region', { name: 'Vagues, toutes les trois heures' }));
    // Une ligne toutes les trois heures : l'heure sans hauteur reste un tiret, jamais 0.
    expect(table.getAllByRole('row').length).toBeGreaterThan(4);
    expect(table.getAllByText('O').length).toBeGreaterThan(0);
    expect(screen.getByText(/pas une mesure de bouée/)).toBeInTheDocument();
  });

  it('montre un tiret pour une hauteur ou une periode absente', () => {
    const sparse: MarineHourly = {
      timeline: SERIES.timeline,
      waveHeight: SERIES.waveHeight.map((_, i) => (i === 3 ? 1.2 : i === 0 ? null : 0.9)),
      wavePeriod: [],
      waveDirection: [],
    };
    render(
      <MarinePanel state={ready(sparse)} outlook={waveOutlook({ series: sparse, now: NOW })} />,
    );
    const table = within(screen.getByRole('region', { name: 'Vagues, toutes les trois heures' }));
    expect(table.getAllByText('–').length).toBeGreaterThan(0);
  });

  it('dit pourquoi il n y a rien a montrer', () => {
    const { rerender } = render(<MarinePanel state={{ status: 'loading' }} outlook={null} />);
    expect(screen.getByText('Lecture des vagues…')).toBeInTheDocument();
    rerender(
      <MarinePanel state={{ status: 'error', failure: { kind: 'network' } }} outlook={null} />,
    );
    expect(screen.getByText('Vagues indisponibles pour l’instant.')).toBeInTheDocument();
    rerender(<MarinePanel state={ready(SERIES)} outlook={null} />);
    expect(screen.getByText(/trop à l’intérieur des terres/)).toBeInTheDocument();
  });

  it('annonce une hauteur actuelle inconnue sans l inventer', () => {
    const series: MarineHourly = {
      ...SERIES,
      waveHeight: SERIES.waveHeight.map((_, i) => (i === 2 ? null : 1)),
    };
    render(<MarinePanel state={ready(series)} outlook={waveOutlook({ series, now: NOW })} />);
    expect(screen.getByText('Hauteur actuelle inconnue.')).toBeInTheDocument();
  });
});
