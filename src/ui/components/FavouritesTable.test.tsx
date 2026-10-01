import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { hourlyPoint } from '../../../tests/factories';
import type { Place } from '../../domain/types';
import type { FavouriteSnapshot } from '../hooks/useFavouriteSnapshots';
import { FavouritesTable } from './FavouritesTable';

function place(name: string, alias: string | null = null): Place {
  return {
    id: name,
    name,
    latitude: 45,
    longitude: 5,
    elevation: 100,
    admin: null,
    alias,
  };
}

function ready(
  name: string,
  temperature: number | null,
  digest: FavouriteSnapshot & { status: 'ready' } extends { digest: infer D } ? D : never,
  model: 'arome' | 'ecmwf' = 'arome',
  alias: string | null = null,
): FavouriteSnapshot {
  return {
    place: place(name, alias),
    status: 'ready',
    hours: [],
    model,
    manual: false,
    digest,
    point: {
      ...hourlyPoint('2026-09-28T16:00', { temperature }),
      model,
      filledFrom: {},
    },
  };
}

const SNAPSHOTS: readonly FavouriteSnapshot[] = [
  ready('Lyon', 21.4, { tempMin: 12, tempMax: 22, rainMm: 4.2, gustMax: 48 }),
  ready('Brest', 15.6, { tempMin: 11, tempMax: 16, rainMm: 0, gustMax: 71 }, 'ecmwf', 'Chez nous'),
  ready('Nice', null, { tempMin: null, tempMax: null, rainMm: null, gustMax: null }),
  { place: place('Pau'), status: 'loading' },
  { place: place('Metz'), status: 'error' },
];

function rowNames(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

describe('FavouritesTable', () => {
  it('compare les lieux : temperature, extremes, pluie, rafales et modele de chacun', () => {
    render(
      <FavouritesTable
        snapshots={SNAPSHOTS}
        activePlaceId={null}
        windUnit="kmh"
        onOpen={vi.fn()}
      />,
    );
    const lyon = screen.getByRole('button', { name: /Lyon/ }).closest('tr') as HTMLElement;
    const cells = within(lyon).getAllByRole('cell');
    expect(cells.map((c) => c.textContent)).toEqual([
      'Lyon',
      '21',
      '12 à 22',
      '4,2',
      '48',
      'AROME',
    ]);
    const brest = screen.getByRole('button', { name: /Chez nous/ }).closest('tr') as HTMLElement;
    expect(
      within(brest)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Chez nous', '16', '11 à 16', '0', '71', 'ECMWF IFS']);
  });

  it('ecrit un tiret plutot qu un zero pour une grandeur absente, et dit les lieux sans prevision', () => {
    render(
      <FavouritesTable
        snapshots={SNAPSHOTS}
        activePlaceId={null}
        windUnit="kmh"
        onOpen={vi.fn()}
      />,
    );
    const nice = screen.getByRole('button', { name: /Nice/ }).closest('tr') as HTMLElement;
    expect(
      within(nice)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Nice', '–', '–', '–', '–', 'AROME']);
    expect(screen.getByText('Pau').closest('tr')).toHaveTextContent('chargement');
    expect(screen.getByText('Metz').closest('tr')).toHaveTextContent('indisponible');
  });

  it('trie par une colonne au clic, decroissant au second clic, avec les valeurs absentes en dernier', async () => {
    const user = userEvent.setup();
    render(
      <FavouritesTable
        snapshots={SNAPSHOTS}
        activePlaceId={null}
        windUnit="kmh"
        onOpen={vi.fn()}
      />,
    );
    expect(rowNames()).toEqual(['Lyon', 'Chez nous', 'Nice', 'Pau', 'Metz']);
    await user.click(screen.getByRole('button', { name: /Rafales/ }));
    // Croissant : Lyon (48), Brest (71), puis les lieux sans valeur, dans l'ordre d'origine.
    expect(rowNames()).toEqual(['Lyon', 'Chez nous', 'Nice', 'Pau', 'Metz']);
    await user.click(screen.getByRole('button', { name: /Rafales/ }));
    expect(rowNames()).toEqual(['Chez nous', 'Lyon', 'Nice', 'Pau', 'Metz']);
    expect(screen.getByRole('columnheader', { name: /Rafales/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('exprime les rafales dans l unite choisie', () => {
    render(
      <FavouritesTable snapshots={SNAPSHOTS} activePlaceId={null} windUnit="kt" onOpen={vi.fn()} />,
    );
    const lyon = screen.getByRole('button', { name: /Lyon/ }).closest('tr') as HTMLElement;
    expect(within(lyon).getAllByRole('cell')[4]?.textContent).toBe('26');
    expect(screen.getByRole('columnheader', { name: /Rafales/ })).toHaveTextContent('kt');
  });

  it('ouvre le lieu au clic sur son nom, et marque le lieu ouvert', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <FavouritesTable
        snapshots={SNAPSHOTS}
        activePlaceId="Brest"
        windUnit="kmh"
        onOpen={onOpen}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Lyon/ }));
    expect(onOpen).toHaveBeenCalledWith(SNAPSHOTS[0]?.place);
    expect(screen.getByRole('button', { name: /Chez nous/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
