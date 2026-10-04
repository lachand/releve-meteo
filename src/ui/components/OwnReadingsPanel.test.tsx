import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw';
import { resetMemoryDatasetStore } from '../../data/cache/datasetStore';
import { deleteDbForTests } from '../../data/cache/db';
import {
  readOwnReadings,
  resetMemoryOwnReadingsForTests,
  writeOwnReadings,
} from '../../data/cache/ownReadingsStore';
import type { OwnReading } from '../../domain/ownReadings';
import type { Place } from '../../domain/types';
import { useOwnReadings } from '../hooks/useOwnReadings';
import { OwnReadingsPanel } from './OwnReadingsPanel';

const LYON: Place = {
  id: 'lyon',
  name: 'Lyon',
  latitude: 45.75,
  longitude: 4.85,
  elevation: 173,
  admin: 'Rhône',
  alias: null,
};
const TODAY = '2026-10-04';
const PREVIOUS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast';

/** 24 heures du 3 octobre : 9 °C a 5 h, 21 °C a 15 h, 0,1 mm par heure. */
function previousDayResponse() {
  const time = Array.from({ length: 24 }, (_, h) => `2026-10-03T${String(h).padStart(2, '0')}:00`);
  return {
    latitude: 45.75,
    longitude: 4.85,
    elevation: 173,
    timezone: 'Europe/Paris',
    utc_offset_seconds: 7200,
    hourly: {
      time,
      temperature_2m_previous_day1: time.map((_, h) => (h === 5 ? 9 : h === 15 ? 21 : 15)),
      precipitation_previous_day1: time.map(() => 0.1),
    },
  };
}

function Harness({ models = ['arome'] as const }) {
  const store = useOwnReadings();
  return <OwnReadingsPanel place={LYON} models={models} today={TODAY} store={store} />;
}

beforeEach(async () => {
  resetMemoryDatasetStore();
  await deleteDbForTests();
  server.use(http.get(PREVIOUS_URL, () => HttpResponse.json(previousDayResponse())));
});
afterEach(() => {
  localStorage.clear();
  resetMemoryOwnReadingsForTests();
});

const SAVED: OwnReading = {
  placeId: 'lyon',
  date: '2026-10-03',
  tempMax: 20,
  tempMin: 10,
  rain: 2,
};

describe('OwnReadingsPanel', () => {
  it('invite a saisir une mesure, sans rien charger tant qu il n y en a pas', () => {
    render(<Harness />);
    expect(screen.getByText(/Aucune mesure saisie pour Lyon/)).toBeInTheDocument();
    expect(screen.getByLabelText('Jour')).toHaveValue('2026-10-03');
  });

  it('enregistre une mesure a la francaise, la compare aux modeles, et dit d ou vient chaque valeur', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Maximum (°C)'), '20,5');
    await user.type(screen.getByLabelText('Minimum (°C)'), '10');
    await user.type(screen.getByLabelText('Pluie (mm)'), '2');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(readOwnReadings()).toEqual([
      { placeId: 'lyon', date: '2026-10-03', tempMax: 20.5, tempMin: 10, rain: 2 },
    ]);
    expect(
      await screen.findByText(/a été le plus proche de votre thermomètre/),
    ).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Mesuré par vous')).toBeInTheDocument();
    expect(within(table).getByText('AROME, prévu la veille')).toBeInTheDocument();
    expect(within(table).getByText('20,5 / 10 °C · 2 mm')).toBeInTheDocument();
    expect(within(table).getByText('21 / 9 °C · 2,4 mm')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Écart de chaque modèle à vos mesures' }),
    ).toHaveTextContent('AROME : thermomètre');
  });

  it('refuse une saisie vide, hors bornes ou illisible, sans rien enregistrer', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez au moins une mesure');
    await user.type(screen.getByLabelText('Maximum (°C)'), '99');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('hors des bornes');
    await user.clear(screen.getByLabelText('Maximum (°C)'));
    await user.type(screen.getByLabelText('Maximum (°C)'), 'chaud');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('n’est pas un nombre');
    await user.clear(screen.getByLabelText('Maximum (°C)'));
    await user.type(screen.getByLabelText('Maximum (°C)'), '5');
    await user.type(screen.getByLabelText('Minimum (°C)'), '9');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Le maximum ne peut pas être sous le minimum',
    );
    expect(readOwnReadings()).toEqual([]);
  });

  it('retire une mesure', async () => {
    writeOwnReadings([SAVED]);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(
      await screen.findByRole('button', { name: /Supprimer la mesure du .*3 octobre 2026/ }),
    );
    expect(readOwnReadings()).toEqual([]);
    expect(screen.getByText(/Aucune mesure saisie pour Lyon/)).toBeInTheDocument();
  });

  it('garde vos mesures quand les previsions de la veille manquent, et le dit', async () => {
    writeOwnReadings([SAVED]);
    server.use(http.get(PREVIOUS_URL, () => HttpResponse.error()));
    render(<Harness />);
    expect(
      await screen.findByText(
        /Prévisions de la veille indisponibles pour le moment/,
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByText('20 / 10 °C · 2 mm')).toBeInTheDocument();
  }, 15000);
});
