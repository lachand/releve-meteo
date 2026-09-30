import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StationReport } from '../../data/repository';
import type { StationMatch } from '../../domain/stations';
import type { YesterdayReview } from '../../domain/yesterdayReview';
import type { DatasetState } from '../hooks/useDataset';
import { YesterdayPanel } from './YesterdayPanel';

const MATCH: StationMatch = {
  station: { id: '07480', name: 'Lyon / Bron', latitude: 45.72, longitude: 4.95, elevation: 200 },
  distanceKm: 7.3,
  elevationDelta: -38,
};

const REVIEW: YesterdayReview = {
  date: '2026-09-27',
  hours: 24,
  observedMin: 10,
  observedMax: 33,
  models: [
    { model: 'arpege', pairs: 24, bias: 0.8, mae: 1.1, minGap: 0.4, maxGap: 1.6 },
    { model: 'gfs', pairs: 20, bias: -2.1, mae: 2.1, minGap: -1.2, maxGap: -3.4 },
  ],
};

function ready(match: StationMatch | null = MATCH): DatasetState<StationReport> {
  return {
    status: 'ready',
    value: { match, records: [], models: null, previousDay: null, snapshots: [] },
    fetchedAt: 0,
    stale: false,
  };
}

describe('YesterdayPanel', () => {
  it('dit ce qui a ete mesure, nomme le modele le plus juste et chiffre chaque modele', () => {
    render(<YesterdayPanel state={ready()} review={REVIEW} activeModel="gfs" />);
    expect(
      screen.getByText(/la station Lyon \/ Bron a mesuré de 10 °C à 33 °C/),
    ).toBeInTheDocument();
    expect(screen.getByText(/c’est ARPEGE qui a vu le plus juste/)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /telle qu’il la prévoyait la veille/ });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByRole('rowheader')).toHaveTextContent('ARPEGE');
    expect(rows[1]).toHaveTextContent('+0,8 °C');
    expect(rows[2]).toHaveTextContent('−2,1 °C');
    expect(rows[2]).toHaveAttribute('data-active');
    expect(rows[1]).not.toHaveAttribute('data-active');
  });

  it('rend le tableau atteignable au clavier', () => {
    render(<YesterdayPanel state={ready()} review={REVIEW} activeModel={null} />);
    const region = screen.getByRole('region', { name: /telle qu’il la prévoyait la veille/ });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('dit pourquoi il n y a pas de bilan, sans rien inventer', () => {
    const { rerender } = render(
      <YesterdayPanel state={{ status: 'loading' }} review={null} activeModel={null} />,
    );
    expect(screen.getByText(/Lecture des mesures et des prévisions d’hier/)).toBeInTheDocument();

    rerender(
      <YesterdayPanel
        state={{ status: 'error', failure: { kind: 'malformed', detail: 'test' } }}
        review={null}
        activeModel={null}
      />,
    );
    expect(screen.getByText(/Bilan d’hier indisponible/)).toBeInTheDocument();

    rerender(<YesterdayPanel state={ready(null)} review={null} activeModel={null} />);
    expect(screen.getByText(/Pas de station de mesure représentative/)).toBeInTheDocument();

    rerender(<YesterdayPanel state={ready()} review={null} activeModel={null} />);
    expect(screen.getByText(/n’a pas assez de mesures d’hier/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
