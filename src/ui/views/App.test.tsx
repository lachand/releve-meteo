import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { deleteDbForTests } from '../../data/cache/db';
import { resetMemoryForecastStore } from '../../data/cache/forecastStore';
import { resetMemoryGeocodingStore } from '../../data/cache/geocodingStore';
import { App } from './App';

function forecastPayload() {
  const now = new Date();
  const time = Array.from({ length: 48 }, (_, i) => {
    const d = new Date(now.getTime() + i * 3600_000);
    return d.toISOString().slice(0, 16);
  });
  const nums = (value: number) => time.map(() => value);
  return {
    latitude: 45.49,
    longitude: 5.47,
    elevation: 468,
    timezone: 'Europe/Paris',
    utc_offset_seconds: 7200,
    hourly: {
      time,
      temperature_2m_meteofrance_arome_france_hd: nums(14),
      precipitation_meteofrance_arome_france_hd: nums(0),
      wind_speed_10m_meteofrance_arome_france_hd: nums(10),
      wind_gusts_10m_meteofrance_arome_france_hd: nums(20),
      wind_direction_10m_meteofrance_arome_france_hd: nums(200),
      pressure_msl_meteofrance_arome_france_hd: nums(1013),
      dew_point_2m_meteofrance_arome_france_hd: nums(8),
      cloud_cover_meteofrance_arome_france_hd: nums(50),
      shortwave_radiation_meteofrance_arome_france_hd: nums(0),
      weather_code_meteofrance_arome_france_hd: nums(1),
    },
    daily: {
      time: ['2026-08-17'],
      temperature_2m_max_meteofrance_arome_france_hd: [22],
      temperature_2m_min_meteofrance_arome_france_hd: [12],
      precipitation_sum_meteofrance_arome_france_hd: [0],
      uv_index_max_meteofrance_arome_france_hd: [5],
      weather_code_meteofrance_arome_france_hd: [1],
      sunrise_meteofrance_arome_france_hd: ['2026-08-17T06:30'],
      sunset_meteofrance_arome_france_hd: ['2026-08-17T21:00'],
    },
  };
}

beforeEach(async () => {
  await deleteDbForTests();
  resetMemoryForecastStore();
  resetMemoryGeocodingStore();
});

describe('App', () => {
  it("invite a chercher un lieu quand aucun lieu n'est selectionne", () => {
    render(<App />);
    expect(screen.getByText('Aucun lieu enregistre.')).toBeInTheDocument();
  });

  it('affiche la prevision une fois un lieu selectionne', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({
          results: [
            { latitude: 45.49, longitude: 5.47, name: 'Virieu', elevation: 415, admin2: 'Isère' },
          ],
        }),
      ),
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(forecastPayload()),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Chercher une commune'), 'Virieu');
    const option = await screen.findByRole('button', { name: 'Virieu, Isère' });
    await user.click(option);

    expect(await screen.findByText('14,0 °C')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Virieu/ })).toBeInTheDocument();
  });

  it("affiche un etat d'erreur avec une action de reprise quand la prevision echoue", async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({
          results: [
            { latitude: 45.49, longitude: 5.47, name: 'Virieu', elevation: 415, admin2: 'Isère' },
          ],
        }),
      ),
      http.get('https://api.open-meteo.com/v1/forecast', () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Chercher une commune'), 'Virieu');
    const option = await screen.findByRole('button', { name: 'Virieu, Isère' });
    await user.click(option);

    expect(
      await screen.findByText('Prevision indisponible.', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reessayer' })).toBeInTheDocument();
  });

  it('bascule vers le mode comparaison et revient en arriere', async () => {
    server.use(
      http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
        HttpResponse.json({
          results: [
            { latitude: 45.49, longitude: 5.47, name: 'Virieu', elevation: 415, admin2: 'Isère' },
          ],
        }),
      ),
      http.get('https://api.open-meteo.com/v1/forecast', () =>
        HttpResponse.json(forecastPayload()),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('Chercher une commune'), 'Virieu');
    const option = await screen.findByRole('button', { name: 'Virieu, Isère' });
    await user.click(option);

    await screen.findByText('14,0 °C');
    await user.click(await screen.findByRole('button', { name: 'Comparer les modèles' }));

    expect(screen.getByRole('heading', { name: 'Comparer les modèles' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('heading', { name: 'Comparer les modèles' })).not.toBeInTheDocument();
  });
});
