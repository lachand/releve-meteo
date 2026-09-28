import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Nowcast } from '../../data/mappers/nowcastMapper';
import type { DatasetState } from '../hooks/useDataset';
import { NowcastPanel } from './NowcastPanel';

// 13h45 locale (CEST, UTC+2) le 17 aout 2026, alignee sur le premier pas du nowcast.
const NOW = new Date('2026-08-17T11:45:00Z');

function readyState(
  times: readonly string[],
  precipitation: readonly (number | null)[],
): DatasetState<Nowcast> {
  return {
    status: 'ready',
    value: { times, precipitation },
    fetchedAt: 0,
    stale: false,
  };
}

describe('NowcastPanel', () => {
  it('ne rend rien a l etat idle', () => {
    const { container } = render(<NowcastPanel state={{ status: 'idle' }} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche un squelette de chargement a l etat loading', () => {
    const { container } = render(<NowcastPanel state={{ status: 'loading' }} now={NOW} />);
    const skeleton = container.querySelector('[aria-busy="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveAttribute('aria-label', 'Chargement du nowcast');
  });

  it('affiche un message d indisponibilite a l etat error', () => {
    render(<NowcastPanel state={{ status: 'error', failure: { kind: 'network' } }} now={NOW} />);
    expect(
      screen.getByText('Pluie au quart d’heure indisponible pour le moment.'),
    ).toBeInTheDocument();
  });

  it('annonce l absence de pluie a l etat ready quand la serie reste seche', () => {
    const times = ['2026-08-17T13:45', '2026-08-17T14:00', '2026-08-17T14:15', '2026-08-17T14:30'];
    render(<NowcastPanel state={readyState(times, [0, 0, 0, 0])} now={NOW} />);
    expect(screen.getByText('Pas de pluie attendue d’ici 1 h.')).toBeInTheDocument();
  });

  it('annonce la pluie a venir avec son delai et son cumul de pointe', () => {
    const times = ['2026-08-17T13:45', '2026-08-17T14:00', '2026-08-17T14:15', '2026-08-17T14:30'];
    render(<NowcastPanel state={readyState(times, [0, 0, 0.5, 0.5])} now={NOW} />);
    expect(
      screen.getByText('Pluie dans 30 min, jusqu’à 0,5 mm par quart d’heure.'),
    ).toBeInTheDocument();
  });

  it('rend le graphique avec son libelle accessible et une barre par pas', () => {
    const times = ['2026-08-17T13:45', '2026-08-17T14:00', '2026-08-17T14:15', '2026-08-17T14:30'];
    render(<NowcastPanel state={readyState(times, [0, 0, 0, 0])} now={NOW} />);
    const chart = screen.getByRole('img', { name: "Pluie par quart d'heure sur deux heures" });
    expect(chart.children).toHaveLength(4);
  });

  it('marque les pas sans valeur avec data-missing, jamais comme un pas sec', () => {
    const times = ['2026-08-17T13:45', '2026-08-17T14:00', '2026-08-17T14:15', '2026-08-17T14:30'];
    const { container } = render(
      <NowcastPanel state={readyState(times, [null, 0, 0, 0])} now={NOW} />,
    );
    expect(container.querySelectorAll('[data-missing]')).toHaveLength(1);
  });

  it('cite la source AROME 1,3 km au pas de 15 minutes', () => {
    const times = ['2026-08-17T13:45'];
    render(<NowcastPanel state={readyState(times, [0])} now={NOW} />);
    expect(screen.getByText('AROME 1,3 km, pas de 15 min')).toBeInTheDocument();
  });
});
