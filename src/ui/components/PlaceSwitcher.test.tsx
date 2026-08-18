import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Place } from '../../domain/types';
import { PlaceSwitcher } from './PlaceSwitcher';

const virieu: Place = {
  id: '45.4840:5.4759',
  name: 'Virieu',
  latitude: 45.484,
  longitude: 5.4759,
  elevation: 415,
  admin: 'Isère',
  alias: null,
};

const golfeDuMorbihan: Place = {
  id: '47.6559:-2.7603',
  name: 'Vannes',
  latitude: 47.6559,
  longitude: -2.7603,
  elevation: 5,
  admin: 'Morbihan',
  alias: 'Golfe du M.',
};

describe('PlaceSwitcher', () => {
  it('ne rend rien sans favori', () => {
    const { container } = render(
      <PlaceSwitcher
        favourites={[]}
        activePlaceId={null}
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('marque le lieu actif via aria-pressed et affiche l alias', () => {
    render(
      <PlaceSwitcher
        favourites={[virieu, golfeDuMorbihan]}
        activePlaceId={golfeDuMorbihan.id}
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: virieu.name, pressed: false })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: golfeDuMorbihan.alias ?? '', pressed: true }),
    ).toBeInTheDocument();
  });

  it('appelle onSelect au clic sur un lieu', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <PlaceSwitcher
        favourites={[virieu, golfeDuMorbihan]}
        activePlaceId={virieu.id}
        onSelect={onSelect}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: virieu.name, pressed: true }));
    expect(onSelect).toHaveBeenCalledWith(virieu);
  });

  it('reordonne au clic sur deplacer vers le bas', async () => {
    const onReorder = vi.fn();
    const user = userEvent.setup();
    render(
      <PlaceSwitcher
        favourites={[virieu, golfeDuMorbihan]}
        activePlaceId={virieu.id}
        onSelect={vi.fn()}
        onReorder={onReorder}
        onRemove={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: `Deplacer ${virieu.name} vers le bas` }));
    expect(onReorder).toHaveBeenCalledWith([golfeDuMorbihan.id, virieu.id]);
  });

  it('appelle onRemove au clic sur retirer', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <PlaceSwitcher
        favourites={[virieu]}
        activePlaceId={virieu.id}
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onRemove={onRemove}
        onRename={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: `Retirer ${virieu.name} des favoris` }));
    expect(onRemove).toHaveBeenCalledWith(virieu.id);
  });

  it('renomme via le bouton crayon puis Entree', async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(
      <PlaceSwitcher
        favourites={[virieu]}
        activePlaceId={virieu.id}
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onRemove={vi.fn()}
        onRename={onRename}
      />,
    );
    await user.click(screen.getByRole('button', { name: `Renommer ${virieu.name}` }));
    const input = screen.getByLabelText(`Renommer ${virieu.name}`);
    await user.clear(input);
    await user.type(input, 'Chez mamie{Enter}');
    expect(onRename).toHaveBeenCalledWith(virieu.id, 'Chez mamie');
  });
});
