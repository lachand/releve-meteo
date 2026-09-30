import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StationReport } from '../../data/repository';
import type { LeadScores } from '../../domain/leadScores';
import type { StationMatch } from '../../domain/stations';
import type { DatasetState } from '../hooks/useDataset';
import { LeadScoresPanel } from './LeadScoresPanel';

const MATCH: StationMatch = {
  station: { id: '07480', name: 'Lyon / Bron', latitude: 45.72, longitude: 4.95, elevation: 200 },
  distanceKm: 7.3,
  elevationDelta: -38,
};

const SCORES: LeadScores = {
  buckets: [
    { label: '1 h', from: 1, to: 1, models: [{ model: 'arome', pairs: 14, bias: 0.2, mae: 0.6 }] },
    { label: '3 h', from: 2, to: 3, models: [{ model: 'gfs', pairs: 8, bias: -1.3, mae: 1.3 }] },
    { label: '6 h', from: 4, to: 6, models: [] },
    { label: '12 h', from: 7, to: 12, models: [] },
  ],
  snapshots: 30,
  oldestIssuedAt: '2026-09-27T08:00',
  ready: true,
};

function ready(match: StationMatch | null = MATCH): DatasetState<StationReport> {
  return {
    status: 'ready',
    value: { match, records: [], models: null, previousDay: null, snapshots: [] },
    fetchedAt: 0,
    stale: false,
  };
}

describe('LeadScoresPanel', () => {
  it('note chaque modele par echeance et laisse un tiret sous le minimum de paires', () => {
    render(<LeadScoresPanel state={ready()} scores={SCORES} activeModel="arome" />);
    expect(
      screen.getByText(/Le plus juste à 1 h : AROME \(0,6 °C d’erreur moyenne\)/),
    ).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /1, 3, 6 et 12 h avant la mesure/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Modèle', 'À 1 h', 'À 3 h', 'À 6 h', 'À 12 h']);
    const arome = rows[1] as HTMLElement;
    expect(arome).toHaveAttribute('data-active');
    expect(arome).toHaveTextContent('0,6 °C (14 h, +0,2)');
    // AROME n'a pas assez de paires a 3 h : un tiret, jamais un zero.
    expect(within(arome).getAllByRole('cell')[1]).toHaveTextContent('—');
    expect(rows[2]).toHaveTextContent('1,3 °C (8 h, −1,3)');
  });

  it('rend le tableau atteignable au clavier', () => {
    render(<LeadScoresPanel state={ready()} scores={SCORES} activeModel={null} />);
    expect(screen.getByRole('region', { name: /1, 3, 6 et 12 h avant la mesure/ })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('dit « en collecte » tant que les paires manquent, sans aucune note', () => {
    render(
      <LeadScoresPanel
        state={ready()}
        scores={{
          ...SCORES,
          ready: false,
          snapshots: 3,
          buckets: SCORES.buckets.map((b) => ({ ...b, models: [] })),
        }}
        activeModel={null}
      />,
    );
    expect(screen.getByText(/En collecte : 3 prévisions enregistrées/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('dit pourquoi il n y a rien a noter', () => {
    const { rerender } = render(
      <LeadScoresPanel state={{ status: 'loading' }} scores={null} activeModel={null} />,
    );
    expect(screen.getByText(/Lecture des prévisions enregistrées/)).toBeInTheDocument();
    rerender(
      <LeadScoresPanel
        state={{ status: 'error', failure: { kind: 'malformed', detail: 'test' } }}
        scores={null}
        activeModel={null}
      />,
    );
    expect(screen.getByText(/Échéances courtes indisponibles/)).toBeInTheDocument();
    rerender(<LeadScoresPanel state={ready(null)} scores={null} activeModel={null} />);
    expect(screen.getByText(/Pas de station de mesure représentative/)).toBeInTheDocument();
  });
});
