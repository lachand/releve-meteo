import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ComparisonHour } from '../../domain/dayDigest';
import type { ModelId, Place } from '../../domain/types';
import type { FavouriteSnapshot } from '../hooks/useFavouriteSnapshots';
import { modelsSentence } from '../comparisonPresentation';
import { PlaceComparison } from './PlaceComparison';

function place(name: string, alias: string | null = null): Place {
  return { id: name, name, latitude: 45, longitude: 5, elevation: 100, admin: null, alias };
}

function hours(models: readonly ModelId[]): ComparisonHour[] {
  return models.map((model, index) => ({
    time: `2026-09-28T${String(10 + index).padStart(2, '0')}:00`,
    temperature: 15 + index,
    precipitation: index === 1 ? null : 0,
    model,
  }));
}

function ready(name: string, models: readonly ModelId[], alias: string | null = null) {
  return {
    place: place(name, alias),
    status: 'ready',
    model: models[0] ?? null,
    manual: false,
    digest: null,
    point: null,
    hours: hours(models),
  } satisfies FavouriteSnapshot;
}

const LYON = ready('Lyon', ['arome', 'arome']);
const BREST = ready('Brest', ['arome', 'arpege'], 'Chez nous');
const NICE = ready('Nice', ['arome_france', 'arome_france']);

describe('modelsSentence', () => {
  it('nomme chaque modele une fois, dans l ordre ou ils se succedent', () => {
    expect(modelsSentence(hours(['arome', 'arome', 'arpege']))).toBe('AROME puis ARPEGE');
    expect(modelsSentence(hours(['arome', 'arome']))).toBe('AROME');
    expect(modelsSentence([])).toBe('');
  });
});

describe('PlaceComparison', () => {
  it('attend deux lieux dont la prevision est chargee', () => {
    const { rerender } = render(
      <PlaceComparison
        snapshots={[LYON, { place: place('Pau'), status: 'loading' }]}
        activePlaceId="Lyon"
      />,
    );
    expect(
      screen.getByText(/dès que la prévision de deux favoris est chargée/),
    ).toBeInTheDocument();
    rerender(
      <PlaceComparison
        snapshots={[LYON, { place: place('Pau'), status: 'error' }, { ...NICE, hours: [] }]}
        activePlaceId="Lyon"
      />,
    );
    expect(
      screen.getByText(/dès que la prévision de deux favoris est chargée/),
    ).toBeInTheDocument();
  });

  it('compare le lieu ouvert au suivant, et nomme le modele de chacun, sans le cacher', () => {
    render(<PlaceComparison snapshots={[BREST, LYON, NICE]} activePlaceId="Lyon" />);
    const legend = within(screen.getByRole('list', { name: 'Légende' }));
    expect(legend.getAllByRole('listitem')[0]).toHaveTextContent(
      'Lyon, trait plein : prévision AROME',
    );
    expect(legend.getAllByRole('listitem')[1]).toHaveTextContent(
      'Chez nous, trait tireté : prévision AROME puis ARPEGE',
    );
    expect(
      screen.getByRole('img', { name: /^Température, Lyon et Chez nous, 48 heures$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /^Pluie par heure, Lyon et Chez nous/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/une partie de l’écart peut venir de deux modèles différents/),
    ).toBeInTheDocument();
  });

  it('laisse choisir les deux lieux, sans jamais comparer un lieu a lui-meme', async () => {
    const user = userEvent.setup();
    render(<PlaceComparison snapshots={[LYON, BREST, NICE]} activePlaceId="Lyon" />);
    const second = screen.getByLabelText('Second lieu');
    await user.selectOptions(second, 'Nice');
    expect(screen.getByRole('img', { name: /^Température, Lyon et Nice/ })).toBeInTheDocument();
    // Le premier lieu ne peut plus devenir le second, et inversement.
    expect(within(second).getByRole('option', { name: 'Lyon' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Premier lieu'), 'Chez nous');
    expect(
      screen.getByRole('img', { name: /^Température, Chez nous et Nice/ }),
    ).toBeInTheDocument();
  });

  it('retombe sur un autre lieu quand le lieu ouvert devient le second choisi', async () => {
    const user = userEvent.setup();
    const props = { snapshots: [LYON, BREST, NICE] };
    const { rerender } = render(<PlaceComparison {...props} activePlaceId="Lyon" />);
    await user.selectOptions(screen.getByLabelText('Second lieu'), 'Chez nous');
    // On ouvre alors le lieu choisi comme second : il passe premier, le second change.
    rerender(<PlaceComparison {...props} activePlaceId="Brest" />);
    expect(
      screen.getByRole('img', { name: /^Température, Chez nous et Lyon/ }),
    ).toBeInTheDocument();
  });

  it('prend le premier favori quand le lieu ouvert n est pas dans la liste', () => {
    render(<PlaceComparison snapshots={[BREST, NICE]} activePlaceId="ailleurs" />);
    expect(
      screen.getByRole('img', { name: /^Température, Chez nous et Nice/ }),
    ).toBeInTheDocument();
  });
});
