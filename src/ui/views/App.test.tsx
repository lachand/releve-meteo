import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { recordSnapshot } from '../../data/cache/snapshotStore';
import type { ForecastSnapshot } from '../../domain/leadScores';
import type { LocalIsoHour } from '../../domain/types';
import { resetDepartmentsForTests, resetStationsForTests } from '../../data/repository';
import departments from '../../../public/data/departements-fr.json';
import airQualityRaw from '../../../tests/fixtures/live/air-quality-lyon.json?raw';
import archiveRaw from '../../../tests/fixtures/live/archive-lyon.json?raw';
import ensembleRaw from '../../../tests/fixtures/live/ensemble-lyon.json?raw';
import forecastRaw from '../../../tests/fixtures/live/forecast-lyon.json?raw';
import geocodingRaw from '../../../tests/fixtures/live/geocoding-lyon.json?raw';
import gridRaw from '../../../tests/fixtures/live/grid-lyon-arome.json?raw';
import meteostatDataUrl from '../../../tests/fixtures/live/meteostat-07480-2026.csv.gz?inline';
import nowcastRaw from '../../../tests/fixtures/live/nowcast-lyon.json?raw';
import previousRunsRaw from '../../../tests/fixtures/live/previous-runs-bron.json?raw';
import vigilanceRaw from '../../../tests/fixtures/live/vigilance-rhone.json?raw';
import { stationPointPayload } from '../../../tests/fixtures/stationPoint';
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

const VIGILANCE_URL =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records';

function liveHandlers(options: { failForecast?: boolean; failVerification?: boolean } = {}) {
  return [
    http.get('https://geocoding-api.open-meteo.com/v1/search', () =>
      HttpResponse.json(live(geocodingRaw)),
    ),
    http.get('https://api.open-meteo.com/v1/forecast', ({ request }) => {
      const params = new URL(request.url).searchParams;
      if (params.has('minutely_15')) {
        return HttpResponse.json(live(nowcastRaw));
      }
      if (params.get('latitude')?.includes(',') === true) {
        return HttpResponse.json(JSON.parse(gridRaw) as unknown[]);
      }
      // Modeles au point de la station (controle au dernier releve).
      if (params.has('past_hours')) {
        return HttpResponse.json(stationPointPayload());
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
    http.get(VIGILANCE_URL, () => HttpResponse.json(live(vigilanceRaw))),
    http.get('*/data/departements-fr.json', () => HttpResponse.json(departments)),
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
  resetDepartmentsForTests();
  clearModelChoices();
  localStorage.clear();
  resetMemoryPreferencesForTests();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

// Parcours complets, vues chargees a la demande : delai large sous charge.
describe('App', { timeout: 30000 }, () => {
  it("invite a chercher un lieu quand aucun lieu n'est selectionne", () => {
    render(<App />);
    expect(screen.getByText('Aucun lieu au carnet.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('explique en trois lignes, avant tout lieu, d ou vient chaque valeur', () => {
    render(<App />);
    const guide = screen.getByRole('list', { name: 'Comment lire ce carnet' });
    const items = within(guide).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('celui qui convient le mieux au lieu est choisi');
    expect(items[1]).toHaveTextContent('d’où elle vient');
    expect(items[2]).toHaveTextContent('veille en arrière-plan');
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
    // Meilleur creneau : les heures, et le modele qui les fournit.
    expect(
      screen.getByRole('heading', { name: 'Sortir sans pluie' }).closest('section'),
    ).toHaveTextContent(/Sec jusqu’à la nuit, de \d+h à 20h, selon AROME\./);
    // Lyon est en plaine et sans neige annoncee : pas de vue montagne.
    expect(
      screen.queryByRole('heading', { name: 'Neige et isotherme 0 °C' }),
    ).not.toBeInTheDocument();
    // Bulletin : le modele, sa valeur, l'ecart chiffre des autres et la confiance.
    expect(
      screen.getByText(
        /^AROME prévoit \d+\s°C\. Les \d autres modèles s’en écartent de .*\s: confiance /,
      ),
    ).toBeInTheDocument();
  });

  it("affiche un etat d'erreur avec une action de reprise quand la prevision echoue", async () => {
    server.use(...liveHandlers({ failForecast: true }));
    await openLyon();

    expect(
      await screen.findByText('Prévision indisponible.', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    // Une panne n'est pas un quota : rien n'est dit du quota.
    expect(screen.queryByText(/quota/)).not.toBeInTheDocument();
  });

  it('dit le quota atteint et l heure de reprise, sans parler de panne de connexion', async () => {
    server.use(
      http.get(
        'https://api.open-meteo.com/v1/forecast',
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '2100' } }),
      ),
      ...liveHandlers(),
    );
    await openLyon();

    // 15 h 27 locales, plus 35 minutes annoncees par le serveur.
    expect(
      await screen.findByText(
        /Le quota gratuit d’Open-Meteo est atteint\. Réessayez vers 16h02/,
        {},
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Vérifiez la connexion/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('rafraichit tout seul le releve hors ligne des que le reseau revient', async () => {
    server.use(...liveHandlers());
    await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });
    cleanup();

    // Trois jours plus tard, sans reseau : la copie perimee est servie, dite hors ligne.
    vi.setSystemTime(new Date(FIXTURE_NOW.getTime() + 3 * 24 * 60 * 60 * 1000));
    server.use(...liveHandlers({ failForecast: true }));
    render(<App />);
    expect(
      await screen.findByText(/Hors ligne · Relevé du/, {}, { timeout: 6000 }),
    ).toHaveTextContent('se met à jour dès que le réseau revient');

    // Le reseau revient : le releve est relu, sans geste de l'utilisateur.
    server.use(...liveHandlers());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(
      () => expect(screen.queryByText(/Hors ligne · Relevé du/)).not.toBeInTheDocument(),
      {
        timeout: 6000,
      },
    );
  }, 30000);

  it('navigue entre les onglets et memorise la vue dans l URL', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: '15 jours' }));
    expect(screen.getByRole('tab', { name: '15 jours' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Ce que dit l’ensemble ECMWF')).toBeInTheDocument();
    // Cumul hebdomadaire, avec les modeles qui le donnent.
    expect(screen.getByText(/Cumul de pluie prévu, aujourd’hui compris/)).toHaveTextContent(
      /\d+(,\d)? mm sur 7 jours, selon .+\./,
    );
    expect(window.location.search).toContain('vue=jours');

    // Fleche droite : onglet suivant, motif ARIA des onglets.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Cartes' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ouvre les cartes : radar observe et prevision du modele retenu sur la grille', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Cartes' }));
    expect(
      await screen.findByRole('heading', { name: 'Pluie et température selon AROME, 48 heures' }),
    ).toBeInTheDocument();
    const slider = await screen.findByRole('slider', { name: 'Échéance de la carte' });
    // Grille reelle enregistree a 17 h : la carte commence a sa premiere heure.
    expect(slider).toHaveAttribute('aria-valuetext', 'lundi 17h, dans 2 h');
    await user.click(screen.getByRole('button', { name: 'Température' }));
    expect(screen.getByText(/^De -?\d+ à -?\d+ °C sur la zone\.$/)).toBeInTheDocument();
    expect(window.location.search).toContain('vue=carte');
  });

  it('place les favoris sur la carte avec la valeur du modele retenu', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));

    await user.click(screen.getByRole('tab', { name: 'Cartes' }));
    expect(
      await screen.findByRole('heading', { name: 'Mes lieux, en ce moment' }),
    ).toBeInTheDocument();
    const favourites = within(screen.getByRole('list', { name: 'Mes lieux, valeurs du moment' }));
    expect(await favourites.findByText(/selon AROME$/)).toBeInTheDocument();
  });

  it('compare deux favoris dans un tableau : valeur, extremes, pluie, rafales et modele', async () => {
    server.use(...liveHandlers());
    const favourite = (name: string, latitude: number, longitude: number) => ({
      id: `${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
      name,
      latitude,
      longitude,
      elevation: 170,
      admin: null,
      alias: null,
    });
    localStorage.setItem(
      'meteo-fr:prefs',
      JSON.stringify({
        version: 1,
        favourites: [favourite('Lyon', 45.7578, 4.832), favourite('Villeurbanne', 45.7719, 4.8902)],
        units: { temperature: 'C', wind: 'kmh' },
        theme: 'auto',
        solar: { peakKwp: null },
        apiKeys: { vigilance: null, infoclimat: null },
        alerts: [],
      }),
    );
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });
    await user.click(screen.getByRole('tab', { name: 'Cartes' }));
    const table = await screen.findByRole(
      'table',
      { name: /Comparaison des lieux favoris/ },
      { timeout: 8000 },
    );
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    // Les deux lieux recoivent la meme prevision enregistree : modele nomme, valeurs chiffrees.
    await within(table).findAllByText('AROME', {}, { timeout: 8000 });
    expect(within(rows[0] as HTMLElement).getAllByRole('cell')[1]?.textContent).toMatch(/^\d+$/);
  });

  it('signale une alerte personnelle franchie par la prevision', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    const form = within(screen.getByRole('form', { name: 'Nouvelle alerte' }));
    await user.selectOptions(form.getByLabelText('Sens'), 'gt');
    const threshold = form.getByLabelText('Seuil (°C)');
    await user.clear(threshold);
    await user.type(threshold, '25');
    await user.click(form.getByRole('button', { name: 'Ajouter' }));

    const banner = await screen.findByRole('region', { name: 'Votre alerte est franchie' });
    expect(banner).toHaveTextContent(/Température au-dessus de 25 °C : dès lundi 16h/);
    expect(banner).toHaveTextContent(/selon AROME/);
    expect(
      screen.getByRole('checkbox', { name: /^Température au-dessus de 25\s°C$/ }),
    ).toBeChecked();
  });

  it('dit la vigilance verte du departement, sans bandeau', async () => {
    server.use(...liveHandlers());
    await openLyon();
    expect(
      await screen.findByText(
        /Vigilance Météo-France : verte pour Rhône \(69\)/,
        {},
        { timeout: 4000 },
      ),
    ).toHaveTextContent('aujourd’hui et demain (bulletin de 16h)');
    expect(screen.queryByRole('region', { name: /^Vigilance/ })).not.toBeInTheDocument();
  });

  it('place une vigilance orange en tete du releve', async () => {
    const orange = live(vigilanceRaw) as { results: Record<string, unknown>[] };
    orange.results = orange.results.map((record) =>
      record.phenomenon_id === 3 && record.begin_time === '2026-09-28T14:00:00+00:00'
        ? { ...record, color_id: 3 }
        : record,
    );
    // Le premier gestionnaire qui correspond l'emporte.
    server.use(
      http.get(VIGILANCE_URL, () => HttpResponse.json(orange)),
      ...liveHandlers(),
    );
    await openLyon();
    const banner = await screen.findByRole(
      'region',
      { name: 'Vigilance orange · Rhône (69)' },
      { timeout: 4000 },
    );
    expect(banner).toHaveTextContent('Orange orages : aujourd’hui, de 16h à minuit');
    expect(banner).toHaveTextContent('Vigilance officielle de Météo-France');
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

  it('ouvre un lien partage avec son modele : choix manuel dit a l ecran, repris dans le lien', async () => {
    server.use(...liveHandlers());
    window.history.replaceState(
      null,
      '',
      '/?lat=45.7578&lon=4.832&nom=Lyon&alt=170&dep=Rh%C3%B4ne&modele=arpege',
    );
    const user = userEvent.setup();
    render(<App />);
    // Jamais impose en silence : le tampon dit « Choix manuel ».
    expect(await screen.findByText('Choix manuel', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(window.location.search).toContain('modele=arpege');

    // Le bouton copie ce meme lien, modele compris.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    await user.click(screen.getByRole('button', { name: 'Copier le lien de ce relevé' }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(String(writeText.mock.calls[0]?.[0])).toContain('modele=arpege');
  });

  it('ignore un modele inconnu dans le lien', async () => {
    server.use(...liveHandlers());
    window.history.replaceState(
      null,
      '',
      '/?lat=45.7578&lon=4.832&nom=Lyon&modele=meteo-fantaisie',
    );
    render(<App />);
    expect(await screen.findByText('Modèle retenu', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(window.location.search).not.toContain('modele=');
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
    expect(
      screen.getByRole('table', { name: /Erreur absolue moyenne.*Température/ }),
    ).toBeInTheDocument();
    // Biais de la prevision de la veille selon le moment de la journee.
    expect(
      await screen.findByRole('heading', { name: 'Biais selon le moment de la journée' }),
    ).toBeInTheDocument();
    // Historique : l'erreur de chaque jour, sur la fenetre de 30 jours deja lue.
    expect(
      await screen.findByRole('heading', { name: 'Historique de fiabilité' }),
    ).toBeInTheDocument();

    // Controle au dernier releve : METAR de 10 h UTC (12 h locale), 26 °C.
    // Jeu de donnees distinct de la verification : il peut arriver apres.
    const gaps = await screen.findByRole('table', { name: /face à la mesure/ }, { timeout: 8000 });
    expect(within(gaps).getAllByRole('row').length).toBeGreaterThan(2);
    expect(await screen.findByText(/Relevé de 12h, il y a 3 h 27/)).toBeInTheDocument();
  }, 20000);

  it('ne rend aucun verdict d usage (velo, randonnee, linge, jardinage) : trop subjectif', async () => {
    server.use(...liveHandlers());
    await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });
    expect(screen.queryByText('Au quotidien')).not.toBeInTheDocument();
    expect(screen.queryByText(/Vélo|Randonnée|Linge qui sèche|Jardinage/)).not.toBeInTheDocument();
  }, 20000);

  it('estime la production solaire des que la puissance crete est saisie, et jamais avant', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });
    expect(
      screen.queryByRole('heading', { name: 'Production solaire sur 48 heures' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réglages' }));
    await user.type(screen.getByLabelText('Puissance crête installée (kWc)'), '4,5');
    await user.click(screen.getByRole('button', { name: 'Fermer' }));

    const heading = await screen.findByRole('heading', {
      name: 'Production solaire sur 48 heures',
    });
    const section = heading.closest('section') as HTMLElement;
    expect(
      await within(section).findByText(/Aujourd’hui : environ .* kWh estimés/),
    ).toBeInTheDocument();
    expect(await within(section).findByText(/Estimation, pas une mesure/)).toBeInTheDocument();
  }, 20000);

  it('imprime le releve en feuille de registre, avec sa date et ce que les valeurs sont', async () => {
    server.use(...liveHandlers());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    // La mention n'existe qu'une fois un lieu ouvert, et ne se voit qu'a l'impression.
    const sheet = screen.getByText(/Feuille de registre, imprimée le lundi 28 septembre 2026/);
    expect(sheet).toHaveTextContent('prévisions');
    expect(sheet).toHaveTextContent('jamais des mesures');

    await user.click(screen.getByRole('button', { name: 'Imprimer le relevé' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  }, 20000);

  it('met l essentiel en tete d Aujourd hui et replie les sections secondaires', async () => {
    server.use(...liveHandlers());
    await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    const order = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    const tendance = order.indexOf('Tendance');
    expect(order.indexOf('Sortir sans pluie')).toBeLessThan(
      order.indexOf('Les 24 prochaines heures'),
    );
    expect(order.indexOf('Les 24 prochaines heures')).toBeLessThan(tendance);
    for (const secondary of ['Qualité de l’air et pollens', 'Soleil, rosée, gel']) {
      expect(order.indexOf(secondary)).toBeGreaterThan(tendance);
      expect(
        screen.getByRole('heading', { name: secondary }).closest('details'),
      ).not.toHaveAttribute('open');
    }
  }, 20000);

  it('fait entrer les notes courtes dans le choix du modele, et le dit dans l onglet Modeles', async () => {
    server.use(...liveHandlers());
    // Dix relevees horaires de la matinee (2 h a 11 h), chacune avec les 12 heures
    // suivantes : AROME colle a 25 °C, ARPEGE s'en ecarte de 6 °C.
    for (let issued = 2; issued <= 11; issued += 1) {
      const timeline = Array.from(
        { length: 12 },
        (_, i) => `2026-09-28T${String(issued + 1 + i).padStart(2, '0')}:00` as LocalIsoHour,
      ).filter((time) => time < '2026-09-29');
      const snapshot: ForecastSnapshot = {
        issuedAt: `2026-09-28T${String(issued).padStart(2, '0')}:00` as LocalIsoHour,
        timeline,
        temperature: { arome: timeline.map(() => 25), arpege: timeline.map(() => 31) },
      };
      await recordSnapshot('07480', snapshot, new Date());
    }
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Modèles' }));
    // La station arrive apres la prevision : la phrase apparait quand les notes courtes
    // existent, et nomme la mesure de la station comme source.
    const sentences = await screen.findAllByText(
      /(Plus|Moins) proche des mesures de la station que la moyenne des modèles à courte échéance/,
      {},
      { timeout: 12000 },
    );
    expect(sentences.length).toBeGreaterThan(0);
  }, 30000);

  it('annonce la collecte des echeances courtes, avec les previsions deja enregistrees', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Fiabilité' }));
    const heading = await screen.findByRole('heading', { name: 'De 1 à 12 heures avant' });
    const section = heading.closest('section') as HTMLElement;
    expect(
      await within(section).findByText(/En collecte : 1 prévision enregistrée/),
    ).toBeInTheDocument();
  }, 20000);

  it('compare hier, prevu la veille et mesure, station a station', async () => {
    server.use(...liveHandlers());
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Fiabilité' }));
    const heading = await screen.findByRole('heading', { name: 'Hier, prévu contre réel' });
    const section = heading.closest('section') as HTMLElement;
    const table = await within(section).findByRole(
      'table',
      { name: /telle qu’il la prévoyait la veille/ },
      { timeout: 8000 },
    );
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
    expect(within(section).getByText(/la station Lyon \/ Bron a mesuré de/)).toBeInTheDocument();

    // Pluie tombee : le cumul de la station, ou la raison de son absence, jamais un zero.
    const rain = (
      await screen.findByRole('heading', { name: 'Pluie réellement tombée, 24 heures' })
    ).closest('section') as HTMLElement;
    expect(
      await within(rain).findByText(
        /Mesuré à la station Lyon \/ Bron|n’a pas assez de mesures de pluie/,
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
  }, 20000);

  it('confronte la valeur du modele retenu au dernier releve de la station', async () => {
    server.use(...liveHandlers());
    await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    const line = await screen.findByText(/Mesuré à/, {}, { timeout: 12000 });
    expect(line).toHaveTextContent('Mesuré à Lyon / Bron à 12h : 26 °C (il y a 3 h 27).');
    // Station a station : la valeur d'AROME lue au point de la station
    // (24,8 °C, tests/fixtures/stationPoint.ts), pas celle du lieu.
    expect(line).toHaveTextContent(
      'AROME donnait 24,8 °C au même endroit à la même heure (écart −1,2 °C).',
    );
    expect(
      screen.getByRole('button', { name: 'Tous les modèles face à la mesure' }),
    ).toBeInTheDocument();
  }, 20000);

  it('se replie sur la maille et l echeance quand la verification echoue', async () => {
    server.use(...liveHandlers({ failVerification: true }));
    const user = await openLyon();
    await screen.findByText('Modèle retenu', {}, { timeout: 4000 });

    await user.click(screen.getByRole('tab', { name: 'Fiabilité' }));
    expect(await screen.findByRole('alert', {}, { timeout: 12000 })).toHaveTextContent(
      'Vérification indisponible',
    );
  }, 20000);
});
