import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DayDrift, Drift } from '../../domain/forecastDrift';
import { DriftPanel } from './DriftPanel';

const NOW = new Date('2026-10-03T19:30:00Z');
const SINCE = NOW.getTime() - 24 * 60 * 60 * 1000;

const moved: DayDrift = {
  date: '2026-10-04',
  tempMax: { before: 18, now: 21, delta: 3 },
  tempMin: { before: 8, now: 8, delta: 0 },
  rain: { before: 0, now: 0, delta: 0 },
  modelBefore: 'arome',
  modelNow: 'arome',
  modelChanged: false,
  fields: ['tempMax'],
  moved: true,
};

describe('DriftPanel', () => {
  it('ne rend rien tant que la memoire de l appareil n est pas lue', () => {
    const { container, rerender } = render(<DriftPanel state={{ status: 'idle' }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DriftPanel state={{ status: 'loading' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dit qu il collecte, sans inventer de comparaison', () => {
    render(<DriftPanel state={{ status: 'collecting' }} />);
    expect(
      screen.getByText(/la comparaison apparaîtra dès qu’une prévision aura été gardée/),
    ).toBeInTheDocument();
  });

  it('liste les jours qui ont bouge, avec le depart de la comparaison', () => {
    const drift: Drift = { since: SINCE, days: [moved], moved: [moved] };
    render(<DriftPanel state={{ status: 'ready', drift, now: NOW }} />);
    expect(
      screen.getByText(/1\sjour a bougé depuis la prévision gardée hier à 21h30/),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Jours dont la prévision a bougé' })).toHaveTextContent(
      'dimanche : maximum 21 °C (+3 °C, 18 °C annoncés)',
    );
  });

  it('dit la stabilite sans liste', () => {
    const stable: DayDrift = {
      ...moved,
      tempMax: { before: 18, now: 18.5, delta: 0.5 },
      fields: [],
      moved: false,
    };
    render(
      <DriftPanel
        state={{ status: 'ready', drift: { since: SINCE, days: [stable], moved: [] }, now: NOW }}
      />,
    );
    expect(screen.getByText(/Prévision stable depuis hier à 21h30/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
