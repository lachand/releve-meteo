import type { Page } from '@playwright/test';

// PNG transparent de 1x1 pixel.
const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Intercepte les tuiles OSM/RainViewer avant toute navigation. OpenStreetMap
 * impose une politique explicite contre l'usage automatise repete de ses
 * tuiles (operations.osmfoundation.org/policies/tiles), constatee en
 * pratique pendant le developpement du Lot 6 : quelques verifications
 * manuelles suffisent a declencher des tuiles de repli cote serveur. La
 * carte radar se monte sur toute page ou une prevision se charge
 * (App.tsx) : sans ce repli, chaque execution de la suite e2e (et chaque
 * CI) martelerait tile.openstreetmap.org a chaque test. Verifiee
 * manuellement une fois en conditions reelles plutot que dans la suite
 * automatisee, cf. BACKLOG.md "Ecarts constates".
 */
export async function stubTileRequests(page: Page): Promise<void> {
  const png = Buffer.from(TRANSPARENT_PNG_BASE64, 'base64');
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  );
  await page.route('https://tilecache.rainviewer.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  );
  await page.route('https://api.rainviewer.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        host: 'https://tilecache.rainviewer.com',
        radar: { past: [{ time: 1700000000, path: '/v2/radar/stub' }] },
      }),
    }),
  );
}
