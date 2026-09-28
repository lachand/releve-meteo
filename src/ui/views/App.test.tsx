import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw';
import { deleteDbForTests } from '../../data/cache/db';
import { resetMemoryDatasetStore } from '../../data/cache/datasetStore';
import { resetMemoryForecastStore } from '../../data/cache/forecastStore';
import { resetMemoryGeocodingStore } from '../../data/cache/geocodingStore';
import { clearModelChoices } from '../../data/cache/modelChoice';
import { resetMemoryPreferencesForTests } from '../../data/cache/preferences';
import { resetStationsForTests } from '../../data/repository';
import airQualityRaw from '../../../tests/fixtures/live/air-quality-lyon.json?raw';
import archiveRaw from '../../../tests/fixtures/live/archive-lyon.json?raw';
import ensembleRaw from '../../../tests/fixtures/live/ensemble-lyon.json?raw';
import forecastRaw from '../../../tests/fixtures/live/forecast-lyon.json?raw';
import geocodingRaw from '../../../tests/fixtures/live/geocoding-lyon.json?raw';
import meteostatDataUrl from '../../../tests/fixtures/live/meteostat-07480-2026.csv.gz?inline';
import nowcastRaw from '../../../tests/fixtures/live/nowcast-lyon.json?raw';
import previousRunsRaw from '../../../tests/fixtures/live/previous-runs-bron.json?raw';
import { App } from './App';

/*
 * Parcours complet sur de vraies reponses (Lyon, 28 septembre 2026 a
 * 13h27 UTC, tests/fixtures/live/), date systeme figee au meme instant :
 * seule la date est simulee, les minuteries restent reelles pour MSW et
 * user-event.
 */

const FIXTURE_NOW = new Date('2026-09-28T13:27:00Z');

function live(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Octets du fichier gzip, importe par Vite en URL de donnees base64. */
function meteostatBytes(): ArrayBuffer {
  const base64 = meteostatDataUrl.slice(meteostatDataUrl.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
}

function liveHandlers(options: { failForecast?: boolean; failVerification?: boolean } = {}) {
  return [
    http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
      HttpResponse.json(live(geocodingRaw)),
    ),
    http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
      if (new URL(request.url).searchParams.has('minutely_15')) {
        return HttpResponse.json(live(nowcastRaw));
      }
      return options.failForecast === true
        ? HttpResponse.error()
        : HttpResponse.json(live(forecastRaw));
    }),
    http.get('https://ensemble-api.open-meteo.com/v1/ensemble', () =>
      HttpResponse.json(live(ensembleRaw)),
    ),
    http.get('https://previous-runs-api.open-meteo.com/v1/forecast', () =>
      options.failVerification === true
        ? new HttpResponse(null, { status: 429 })
        : HttpResponse.json(live(previousRunsRaw)),
    ),
    http.get('https://archive-api.open-meteo.com/v1/archive', () =>
      HttpResponse.json(live(archiveRaw)),
    ),
    http.get('https://air-quality-api.open-meteo.com/v1/air-quality', () =>
      HttpResponse.json(live(airQualityRaw)),
    ),
    http.get('https://data.meteostat.net/hourly/:year/:station', () =>
      HttpResponse.arrayBuffer(meteostatBytes(), {
        headers: { 'Content-Type': 'application/gzip' },
      }),
    ),
    http.get('*/data/stations-fr.json', () =>
      HttpResponse.json([
        { id: '07480', name: 'Lyon / Bron', latitude: 45.7167, longitude: 4.95, elevation: 200 },
      ]),
    ),
  ];
}

async function openLyon() {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Chercher une commune'), 'Lyon');
  await user.click(await screen.findByRole('button', { name: 'Lyon, Rhône' }));
  return user;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW);
  await deleteDbForTests();
  resetMemoryForecastStore();
  resetMemoryGeocodingStore();
  resetMemoryDatasetStore();
  resetStationsForTests();
  clearModelChoices();
  localStorage.clear();
  resetMemoryPreferencesForTests();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  it("invite a chercher un lieu quand aucun lieu n'est selectionne", () => {
    render(<App />);
    expect(screen.getByText('Aucun lieu au carnet.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it("ouvre directement le releve d'un lieu d'exemple", async () => {
    server.use(...liveHandlers());
    const user = userEvent.setup();
    render(<App />);

    const examples = ['Paris', 'Chamonix-Mont-Blanc', 'Brest', 'Marseille', 'Strasbourg'];
    for (const name of examples) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}, `) })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'Chamonix-Mont-Blanc, montagne' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Chamonix-Mont-Blanc' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucun lieu au carnet.')).not.toBeInTheDocument();
  });

  it('ouvre le releve du lieu choisi, avec le modele retenu et sa justification', async () => {
    server.use(...liveHandlers());
    await openLyon();

    expect(await screen.findByRole('heading', { level: 1, name: 'Lyon' })).toBeInTheDocument();
    const stamp = await screen.findByText('Modèle retenu', {}, { timeout: 4000 });
    expect(stamp.parentElement).toHaveTextContent('AROME');
    expect(screen.getByText(/AROME retenu pour ce lieu et cette échéance/)).toBeInTheDocument();
    // AROME 1,3 km ne fournit ni nebulosite ni pression : completees et nommees.
    expect(screen.getByText(/Complété, faute de donnée chez AROME/)).toBeInTheDocument();
    expect(window.location.search).toContain('nom=Lyon');
  });

  it("affiche un etat d'erreur avec une action de reprise quand la prevision echoue", async () => {
    server.use(...liveHandlers({ failForecast: true }));
    await openLyon();

    expect(
      await screen.findByText('Prévision indisponible.', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('navigue entre les onglets et memorise la vue dans l URL', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: '15 jours' }));
    expect(screen.getByRole('tab', { name: '15 jours' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Ce que dit l’ensemble ECMWF')).toBeInTheDocument();
    expect(window.location.search).toContain('vue=jours');

    // Fleche droite : onglet suivant, motif ARIA des onglets.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Radar' })).toHaveAttribute('aria-selected', 'true');
  });

  it('laisse choisir un modele manuellement, puis revenir a la selection automatique', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Modèles' }));
    // Vue chargee a la demande : on attend son apparition.
    const chooser = await screen.findByRole('group', { name: 'Modèle de référence pour ce lieu' });
    await user.click(within(chooser).getByRole('radio', { name: /ARPEGE/ }));

    expect(await screen.findByText('Choix manuel')).toBeInTheDocument();
    expect(screen.getByText('ARPEGE, choisi manuellement.')).toBeInTheDocument();

    await user.click(within(chooser).getByRole('radio', { name: /Automatique/ }));
    expect(
      await screen.findByText('AROME retenu pour ce lieu et cette échéance.'),
    ).toBeInTheDocument();
  });

  it('verifie les modeles contre la station la plus proche', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Fiabilité' }));
    // Temperature et vent : la station ; precipitations : pas de cumul horaire
    // mesure, repli sur la reanalyse.
    const observed = await screen.findAllByText(
      /mesures de la station Lyon \/ Bron/,
      {},
      { timeout: 12000 },
    );
    expect(observed).toHaveLength(2);
    expect(screen.getByRole('table', { name: /Température/ })).toBeInTheDocument();
  }, 20000);

  it('se replie sur la maille et l echeance quand la verification echoue', async () => {
    server.use(...liveHandlers({ failVerification: true }));
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Fiabilité' }));
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Vérification indisponible',
    );
  });
});
