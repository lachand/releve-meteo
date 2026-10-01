import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RainOutlookHour } from '../../domain/ensemble';
import { RainOutlookChart } from './RainOutlookChart';

const HOURS: readonly RainOutlookHour[] = [
  { time: '2026-09-28T10:00', probability: 0.5, median: 0.1, p90: 1.2, memberCount: 51 },
  { time: '2026-09-28T11:00', probability: null, median: null, p90: null, memberCount: 0 },
];

describe('RainOutlookChart', () => {
  it('trace la probabilite de pluie et dit ce qu elle mesure, sans la faire passer pour une certitude', () => {
    render(<RainOutlookChart hours={HOURS} memberCount={51} />);
    expect(
      screen.getByRole('img', { name: /Probabilité de pluie heure par heure sur 72 heures/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Part des 51 membres de l’ensemble ECMWF/)).toBeInTheDocument();
    expect(screen.getByText(/Prévision, pas mesure/)).toBeInTheDocument();
  });

  it('dit quand l ensemble manque, au lieu de tracer des barres vides', () => {
    const { rerender } = render(<RainOutlookChart hours={null} memberCount={0} />);
    expect(screen.getByText(/se charge ou n’est pas disponible/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<RainOutlookChart hours={[]} memberCount={0} />);
    expect(screen.getByText(/se charge ou n’est pas disponible/)).toBeInTheDocument();
  });
});
