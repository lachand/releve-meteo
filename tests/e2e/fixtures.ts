import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/*
 * Socle commun des specs e2e :
 *
 * 1. Un garde-fou reseau (fixture automatique) qui fait echouer tout test
 *    emettant une requete vers un hote distant non attendu. Les hotes
 *    externes reellement appeles par l'application sont tous couverts par
 *    `stubApis`/`stubTileRequests` (tests/e2e/apiStub.ts, tileStub.ts) : une
 *    requete vers un autre hote signale soit un oubli de bouchon, soit une
 *    fuite vers le reseau reel, les deux devant faire echouer la CI plutot
 *    que de silencieusement retenter contre Open-Meteo.
 * 2. `openLyon`, le parcours de recherche commun a la plupart des specs.
 */

const ALLOWED_LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);

/** Hotes externes bouches par apiStub.ts / tileStub.ts (et par src/pwa/sw.ts). */
const ALLOWED_EXTERNAL_HOSTNAMES: ReadonlySet<string> = new Set([
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'ensemble-api.open-meteo.com',
  'previous-runs-api.open-meteo.com',
  'archive-api.open-meteo.com',
  'air-quality-api.open-meteo.com',
  'data.meteostat.net',
  'public.opendatasoft.com',
  'tile.openstreetmap.org',
  'tilecache.rainviewer.com',
  'api.rainviewer.com',
]);

function isAllowedRequestUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    // URL illisible (rare) : pas une requete reseau http(s) qui nous concerne.
    return true;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return true;
  }
  return ALLOWED_LOCAL_HOSTNAMES.has(url.hostname) || ALLOWED_EXTERNAL_HOSTNAMES.has(url.hostname);
}

export const test = base.extend<{ forbidUnexpectedNetworkRequests: void }>({
  // Fixture automatique : aucune spec n'a besoin de l'invoquer explicitement,
  // elle s'attache avant meme la premiere navigation du test.
  forbidUnexpectedNetworkRequests: [
    async ({ page }, use) => {
      const offenders: string[] = [];
      const onRequest = (request: { url(): string }): void => {
        const url = request.url();
        if (!isAllowedRequestUrl(url)) {
          offenders.push(url);
        }
      };
      page.on('request', onRequest);

      await use();

      page.off('request', onRequest);
      expect(
        offenders,
        `Requete(s) reseau vers un hote non bouche (CI ne doit jamais appeler Open-Meteo) :\n${offenders.join('\n')}`,
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Recherche « Lyon » (le geocodage bouche renvoie toujours cette seule
 * commune, cf. tests/e2e/apiStub.ts) et ouvre son releve. `stubApis` doit
 * avoir ete appele avant, pour que la navigation initiale soit deja bouchee.
 */
export async function openLyon(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Chercher une commune').fill('Lyon');
  await page.getByRole('button', { name: 'Lyon, Rhône', exact: true }).click();
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });
}

/**
 * Localise un onglet par son libelle complet (celui de TABS dans App.tsx),
 * quelle que soit la largeur de la fenetre : sous 640 px, le libelle court
 * est affiche mais le nom accessible reste le libelle complet
 * (Tabs.module.css, regression couverte par viewport.spec.ts).
 */
export function tabByLabel(page: Page, fullLabel: string): Locator {
  return page.getByRole('tab', { name: fullLabel, exact: true });
}
