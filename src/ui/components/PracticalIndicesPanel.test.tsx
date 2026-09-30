import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PracticalIndices } from '../../domain/practicalIndices';
import { PracticalIndicesPanel } from './PracticalIndicesPanel';

const INDICES: PracticalIndices = {
  day: 'today',
  start: '2026-09-28T10:00',
  end: '2026-09-28T20:00',
  hours: 10,
  models: ['arome'],
  indices: [
    {
      id: 'cycling',
      verdict: 'fair',
      criteria: [
        { key: 'rain', value: 1.5, kind: 'max', good: 0.5, fair: 2, status: 'fair' },
        { key: 'gust', value: 20, kind: 'max', good: 30, fair: 45, status: 'good' },
      ],
    },
    {
      id: 'laundry',
      verdict: 'unknown',
      criteria: [
        { key: 'humidity', value: null, kind: 'max', good: 70, fair: 85, status: 'unknown' },
      ],
    },
  ],
};

describe('PracticalIndicesPanel', () => {
  it('dit les heures jugees, le modele, et un verdict en mots pour chaque indice', () => {
    render(<PracticalIndicesPanel indices={INDICES} windUnit="kmh" />);
    expect(screen.getByText(/selon AROME/)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').filter((li) => li.dataset.verdict !== undefined);
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('Vélo')).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText('Passable')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('Indéterminé')).toBeInTheDocument();
  });

  it('montre les criteres, la valeur lue et les seuils en depliant un indice', async () => {
    const user = userEvent.setup();
    render(<PracticalIndicesPanel indices={INDICES} windUnit="kmh" />);
    await user.click(screen.getByText('Vélo'));
    expect(
      screen.getByText(/Pluie cumulée : 1,5 mm \(favorable jusqu’à 0,5 mm/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rafale maximale : 20 km\/h/)).toBeInTheDocument();
  });

  it('avoue une valeur inconnue et rappelle que ce sont des reperes', () => {
    render(<PracticalIndicesPanel indices={INDICES} windUnit="kmh" />);
    expect(screen.getByText(/Humidité moyenne : inconnue/)).toBeInTheDocument();
    expect(screen.getByText(/Des repères d’usage, pas des normes/)).toBeInTheDocument();
  });

  it('convertit le vent dans l unite choisie', () => {
    render(<PracticalIndicesPanel indices={INDICES} windUnit="kt" />);
    expect(screen.getByText(/Rafale maximale : 11 kt/)).toBeInTheDocument();
  });
});
