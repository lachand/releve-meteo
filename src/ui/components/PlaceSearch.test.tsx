import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw';
import { PlaceSearch } from './PlaceSearch';

describe('PlaceSearch', () => {
  it('affiche les resultats et selectionne un lieu au clic', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({
          results: [
            {
              latitude: 45.484,
              longitude: 5.4759,
              name: 'Virieu',
              elevation: 415,
              admin2: 'Isère',
            },
          ],
        }),
      ),
    );
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<PlaceSearch onSelect={onSelect} />);

    await user.type(screen.getByLabelText('Chercher une commune'), 'Virieu');

    const option = await screen.findByRole('button', { name: 'Virieu, Isère' });
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Virieu', admin: 'Isère' }),
    );
  });

  it('invite a agir quand la recherche ne trouve aucun resultat', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({ results: [] }),
      ),
    );
    const user = userEvent.setup();
    render(<PlaceSearch onSelect={vi.fn()} />);

    await user.type(screen.getByLabelText('Chercher une commune'), 'Xyzabc');

    expect(await screen.findByText(/Aucune commune trouvee/)).toBeInTheDocument();
  });

  it('desactive le bouton de geolocalisation quand elle est indisponible', () => {
    const originalGeolocation = navigator.geolocation;
    // @ts-expect-error simule un navigateur sans API de geolocalisation
    delete navigator.geolocation;

    render(<PlaceSearch onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Utiliser ma position')).toBeDisabled();

    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
    });
  });
});
