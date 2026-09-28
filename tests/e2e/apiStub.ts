import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { stubTileRequests } from './tileStub';

/*
 * Bouchon reseau des tests de bout en bout : chaque API interrogee par
 * l'application recoit une vraie reponse, enregistree le 28 septembre 2026
 * a 13h27 UTC pour Lyon (tests/fixtures/live/). L'horloge du navigateur est
 * figee au meme instant : les echeances, la cascade et la verification
 * sont ainsi celles d'un vrai releve, mais deterministes. Aucune requete
 * ne part vers Open-Meteo, Meteostat ou les serveurs de tuiles.
 */

const LIVE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'live');

/** Instant d'enregistrement des fixtures. */
export const FIXTURE_NOW = new Date('2026-09-28T13:27:00Z');

function fixture(name: string): Buffer {
  return readFileSync(join(LIVE, name));
}

function json(body: Buffer) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body,
  };
}

export interface StubOptions {
  /** Fait echouer la prevision principale (etat d'erreur). */
  readonly failForecast?: boolean;
  /** Fait echouer la verification (exercice du repli). */
  readonly failVerification?: boolean;
}

export async function stubApis(page: Page, options: StubOptions = {}): Promise<void> {
  await page.clock.setFixedTime(FIXTURE_NOW);
  await stubTileRequests(page);

  await page.route('https://api.open-meteo.com/v1/forecast**', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('minutely_15')) {
      return route.fulfill(json(fixture('nowcast-lyon.json')));
    }
    if (options.failForecast === true) {
      return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' } });
    }
    return route.fulfill(json(fixture('forecast-lyon.json')));
  });
  await page.route('https://ensemble-api.open-meteo.com/**', (route) =>
    route.fulfill(json(fixture('ensemble-lyon.json'))),
  );
  await page.route('https://previous-runs-api.open-meteo.com/**', (route) =>
    options.failVerification === true
      ? route.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*' } })
      : route.fulfill(json(fixture('previous-runs-bron.json'))),
  );
  await page.route('https://archive-api.open-meteo.com/**', (route) =>
    route.fulfill(json(fixture('archive-lyon.json'))),
  );
  await page.route('https://air-quality-api.open-meteo.com/**', (route) =>
    route.fulfill(json(fixture('air-quality-lyon.json'))),
  );
  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill(json(fixture('geocoding-lyon.json'))),
  );
  await page.route('https://data.meteostat.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/gzip',
      headers: { 'access-control-allow-origin': '*' },
      body: fixture('meteostat-07480-2026.csv.gz'),
    }),
  );
}

/** URL partagee de Lyon, telle que l'application la produit. */
export const LYON_URL = '/?lat=45.7578&lon=4.832&nom=Lyon&alt=170&dep=Rh%C3%B4ne';
