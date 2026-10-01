import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StationReport } from '../../data/repository';
import type { RainCheck } from '../../domain/rainCheck';
import type { StationMatch } from '../../domain/stations';
import type { DatasetState } from '../hooks/useDataset';
import { RainCheckPanel } from './RainCheckPanel';

const MATCH: StationMatch = {
  station: { id: '07480', name: 'Lyon / Bron', latitude: 45.72, longitude: 4.95, elevation: 200 },
  distanceKm: 9,
  elevationDelta: -38,
};

const CHECK: RainCheck = {
  model: 'arome',
  paired: 23,
  missing: 1,
  observedMm: 3.2,
  forecastMm: 4.1,
};

function ready(match: StationMatch | null = MATCH): DatasetState<StationReport> {
  return {
    status: 'ready',
    value: { match, records: [], models: null, previousDay: null, snapshots: [] },
    fetchedAt: 0,
    stale: false,
  };
}

const plain = (text: string | null) => (text ?? '').replace(/\u00a0/g, ' ');

describe('RainCheckPanel', () => {
  it('donne le cumul mesure et le cumul calcule, chacun avec sa provenance', () => {
    const { container } = render(<RainCheckPanel state={ready()} check={CHECK} />);
    const items = container.querySelectorAll('li[data-provenance]');
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute('data-provenance')).toBe('observed');
    expect(plain(items[0]?.textContent ?? null)).toContain(
      'Mesuré à la station Lyon / Bron (9 km) : 3,2 mm sur les 24 dernières heures (1 h sans mesure, non comptée).',
    );
    expect(items[1]?.getAttribute('data-provenance')).toBe('forecast');
    expect(plain(items[1]?.textContent ?? null)).toContain(
      'Calculé au lieu par AROME, dans sa dernière exécution : 4,1 mm sur les mêmes 23 heures.',
    );
    expect(plain(screen.getByText(/de plus que la station/).textContent)).toBe(
      'AROME voyait 0,9 mm de plus que la station.',
    );
    expect(screen.getByText(/une heure sans mesure n’est jamais un zéro/)).toBeInTheDocument();
  });

  it('dit pourquoi il n y a rien a comparer', () => {
    const { rerender } = render(<RainCheckPanel state={{ status: 'loading' }} check={null} />);
    expect(screen.getByText('Lecture des mesures de pluie…')).toBeInTheDocument();
    rerender(
      <RainCheckPanel
        state={{ status: 'error', failure: { kind: 'malformed', detail: 'test' } }}
        check={null}
      />,
    );
    expect(screen.getByText('Pluie tombée indisponible pour l’instant.')).toBeInTheDocument();
    rerender(<RainCheckPanel state={ready(null)} check={null} />);
    expect(screen.getByText(/Pas de station de mesure représentative/)).toBeInTheDocument();
    rerender(<RainCheckPanel state={ready()} check={null} />);
    expect(
      screen.getByText(/La station Lyon \/ Bron n’a pas assez de mesures de pluie/),
    ).toBeInTheDocument();
  });
});
