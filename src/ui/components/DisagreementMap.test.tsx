import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { gridPoints } from '../../domain/grid';
import type { SpreadGrid } from '../../domain/grid';
import type { Place } from '../../domain/types';
import type { DatasetState } from '../hooks/useDataset';
import { DisagreementMap } from './DisagreementMap';

const place: Place = {
  id: '45.7485:4.8467',
  name: 'Lyon',
  latitude: 45.7485,
  longitude: 4.8467,
  elevation: 170,
  admin: 'Rhône',
  alias: 'Chez nous',
};

// 15 h 27 locale.
const NOW = new Date('2026-09-28T13:27:00Z');
const POINTS = gridPoints(place, 3, 12.5);
const TIMES = ['2026-09-28T14:00', '2026-09-28T15:00', '2026-09-28T16:00'];

function ready(): DatasetState<SpreadGrid> {
  const series = (fn: (t: number, p: number) => number | null) =>
    TIMES.map((_, t) => POINTS.map((__, p) => fn(t, p)));
  return {
    status: 'ready',
    fetchedAt: 0,
    stale: false,
    value: {
      models: ['arome_france', 'arpege', 'gfs'],
      grid: {
        model: 'arome_france',
        provenance: 'forecast',
        points: POINTS,
        stepKm: 12.5,
        times: TIMES,
        temperature: series((_, p) => (p === 0 ? null : p / 2)),
        precipitation: series(() => 0.3),
        windSpeed: series(() => null),
        windDirection: series(() => null),
      },
    },
  };
}

describe('DisagreementMap', () => {
  it('dit ce que la carte coute au quota et ne charge rien avant la demande', async () => {
    const onRequest = vi.fn();
    const user = userEvent.setup();
    render(
      <DisagreementMap
        place={place}
        now={NOW}
        state={{ status: 'idle' }}
        requested={false}
        onRequest={onRequest}
      />,
    );
    expect(screen.getByText(/environ 324 appels du quota gratuit/)).toBeInTheDocument();
    expect(screen.getByText(/autour de Chez nous/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Grandeur affichée' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Afficher la carte du désaccord' }));
    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('montre l ecart entre modeles, avec les modeles nommes et ses limites dites', () => {
    render(
      <DisagreementMap place={place} now={NOW} state={ready()} requested onRequest={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Écart de température' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Écart de pluie' })).toBeInTheDocument();
    expect(screen.getByText(/Écart maximal entre les modèles sur la zone/)).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: /Légende de l’écart entre modèles/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/AROME France, ARPEGE, GFS/)).toBeInTheDocument();
    expect(screen.getByText(/pas qui a raison/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Carte du désaccord entre modèles autour de Lyon/),
    ).toBeInTheDocument();
  });

  it('change de grandeur et dit quand l ecart n est pas calculable', async () => {
    const user = userEvent.setup();
    const state = ready();
    if (state.status !== 'ready') throw new Error('etat de test');
    const empty: DatasetState<SpreadGrid> = {
      ...state,
      value: {
        ...state.value,
        grid: {
          ...state.value.grid,
          temperature: TIMES.map(() => POINTS.map(() => 0.1)),
        },
      },
    };
    render(<DisagreementMap place={place} now={NOW} state={empty} requested onRequest={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Écart de pluie' }));
    expect(screen.getByRole('list', { name: /mm en une heure/ })).toBeInTheDocument();
  });

  it('dit le chargement et l echec', () => {
    const { rerender } = render(
      <DisagreementMap
        place={place}
        now={NOW}
        state={{ status: 'loading' }}
        requested
        onRequest={vi.fn()}
      />,
    );
    expect(screen.getByText('Chargement des grilles de quatre modèles…')).toBeInTheDocument();
    rerender(
      <DisagreementMap
        place={place}
        now={NOW}
        state={{ status: 'error', failure: { kind: 'network' } }}
        requested
        onRequest={vi.fn()}
      />,
    );
    expect(screen.getByText('Carte du désaccord indisponible pour l’instant.')).toBeInTheDocument();
  });
});
