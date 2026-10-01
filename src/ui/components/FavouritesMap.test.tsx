import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { hourlyPoint } from '../../../tests/factories';
import type { Place } from '../../domain/types';
import type { FavouriteSnapshot } from '../hooks/useFavouriteSnapshots';
import { FavouritesMap } from './FavouritesMap';

function place(name: string, latitude: number, longitude: number, alias: string | null = null) {
  return {
    id: `${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    name,
    latitude,
    longitude,
    elevation: 100,
    admin: null,
    alias,
  } satisfies Place;
}

const LYON = place('Lyon', 45.7485, 4.8467);
const BREST = place('Brest', 48.3904, -4.4861, 'Chez nous');
const CHAMONIX = place('Chamonix-Mont-Blanc', 45.9237, 6.8694);

const SNAPSHOTS: readonly FavouriteSnapshot[] = [
  {
    place: LYON,
    status: 'ready',
    hours: [],
    model: 'arome',
    manual: false,
    digest: { tempMin: 12, tempMax: 22, rainMm: 4.2, gustMax: 48 },
    point: {
      ...hourlyPoint('2026-09-28T16:00', { temperature: 21.4, weatherCode: 61, cloudCover: 100 }),
      model: 'arome',
      filledFrom: {},
    },
  },
  {
    place: BREST,
    status: 'ready',
    hours: [],
    model: 'ecmwf',
    manual: true,
    digest: { tempMin: 11, tempMax: 16, rainMm: 0, gustMax: 71 },
    point: {
      ...hourlyPoint('2026-09-28T16:00', { temperature: 15.6, weatherCode: 3 }),
      model: 'ecmwf',
      filledFrom: {},
    },
  },
  { place: CHAMONIX, status: 'loading' },
];

describe('FavouritesMap', () => {
  it('liste chaque favori avec sa valeur, sa condition et le modele qui la donne', () => {
    render(<FavouritesMap snapshots={SNAPSHOTS} activePlaceId={LYON.id} onOpen={vi.fn()} />);
    const list = within(screen.getByRole('list', { name: 'Mes lieux, valeurs du moment' }));
    const items = list.getAllByRole('button');
    expect(items.map((item) => item.textContent)).toEqual([
      'Lyon21 °C, pluie légère, selon AROME',
      'Chez nous16 °C, couvert, selon ECMWF IFS, choisi manuellement',
      'Chamonix-Mont-Blancprévision en cours de chargement',
    ]);
  });

  it('pose une etiquette de station par favori sur la carte, qui ouvre le lieu', async () => {
    const onOpen = vi.fn();
    render(<FavouritesMap snapshots={SNAPSHOTS} activePlaceId={LYON.id} onOpen={onOpen} />);
    const map = screen.getByRole('region', { name: 'Carte des lieux favoris' });
    const plot = within(map).getByRole('button', {
      name: 'Lyon : 21 °C, pluie légère, selon AROME. Ouvrir le relevé.',
    });
    expect(plot).toHaveTextContent('21°');
    expect(plot).toHaveTextContent('Lyon · AROME');
    expect(plot).toHaveAttribute('data-active', 'true');
    await userEvent.click(plot);
    expect(onOpen).toHaveBeenCalledWith(LYON);
    // Favori en chargement : cercle de station vide et points de suspension.
    expect(
      within(map).getByRole('button', {
        name: 'Chamonix-Mont-Blanc : prévision en cours de chargement. Ouvrir le relevé.',
      }),
    ).toHaveTextContent('…');
  });

  it("dit qu'une prevision est indisponible, sans inventer de valeur", async () => {
    const onOpen = vi.fn();
    render(
      <FavouritesMap
        snapshots={[{ place: LYON, status: 'error' }]}
        activePlaceId={null}
        onOpen={onOpen}
      />,
    );
    const item = within(
      screen.getByRole('list', { name: 'Mes lieux, valeurs du moment' }),
    ).getByRole('button');
    expect(item).toHaveTextContent('Lyonprévision indisponible');
    await userEvent.click(item);
    expect(onOpen).toHaveBeenCalledWith(LYON);
  });
});
