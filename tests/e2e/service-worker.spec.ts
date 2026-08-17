import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Test isole, hors du webServer partage de playwright.config.ts : il doit
// pouvoir reconstruire l'application en cours de test pour simuler un
// second deploiement (TESTING.md 6.5), ce que le serveur de previsualisation
// partage ne permet pas sans perturber les autres specs qui tournent en
// parallele sur le port 4173.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, `dist-e2e-sw-${process.pid}`);

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function buildApp(): void {
  execSync(`npx vite build --outDir "${OUT_DIR}" --emptyOutDir`, { cwd: ROOT, stdio: 'pipe' });
}

let server: Server;
let baseUrl: string;

async function startServer(): Promise<void> {
  server = createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    const filePath = path.join(OUT_DIR, urlPath === '/' ? '/index.html' : urlPath);
    readFile(filePath)
      .then((body) => {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'text/plain' });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(404);
        res.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test.describe('Regression du service worker (TESTING.md 6.5)', () => {
  // Serie : le premier test reconstruit `OUT_DIR` en cours de route pour
  // simuler un second deploiement, ce qui entrerait en conflit avec un
  // autre test lisant les memes fichiers via le serveur statique partage
  // si les deux tournaient en parallele.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    buildApp();
    await startServer();
  });

  test.afterAll(async () => {
    await stopServer();
    execSync(`rm -rf "${OUT_DIR}"`);
  });

  test('bandeau de mise a jour, activation unique, purge, cache de tuiles preserve', async ({
    page,
  }) => {
    // 1. Charger la version A, attendre l'activation du SW. Le premier
    // chargement n'est jamais controle par le worker qui vient de s'y
    // installer (la page qui declenche l'installation reste hors de son
    // controle par definition du spec SW) : on attend `ready`, puis on
    // recharge une fois pour obtenir une page effectivement controlee,
    // condition que `pwa/install.ts` exige pour distinguer une mise a
    // jour d'une premiere installation.
    await page.goto(baseUrl);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Un `reload()` immediatement apres la resolution de `ready` course
    // parfois avec le navigateur (frame detache) : laisser un instant.
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 20000,
    });

    const shellBefore = await page.evaluate(async () => {
      const names = await caches.keys();
      return names.find((n) => n.startsWith('meteo-fr-shell-'));
    });
    expect(shellBefore).toBeDefined();

    // Seme une entree synthetique dans le cache de tuiles : aucune tuile
    // reelle n'est encore recuperee au lot 3 (TILE_HOSTS vide, peuple au
    // lot 6), ce qui permet de verifier isolement que la purge a
    // l'activation ne touche jamais ce cache non versionne sur le build
    // (SERVICE_WORKER.md section 2 et 4).
    await page.evaluate(async () => {
      const cache = await caches.open('meteo-fr-tiles-v1');
      await cache.put('/synthetic-tile.png', new Response('tuile', { status: 200 }));
    });

    // 2. Deployer la version B sur le serveur de test : memes sources,
    // nouvel identifiant de build (horodatage) genere par chaque
    // invocation de `vite build`, donc un nouveau nom de cache shell.
    buildApp();

    // 3. Recharger : le bandeau de mise a jour apparait.
    let loadCount = 0;
    page.on('load', () => {
      loadCount += 1;
    });
    await page.reload();
    await expect(page.getByText('Une nouvelle version est disponible.')).toBeVisible({
      timeout: 20000,
    });

    // 4. Cliquer « Actualiser » : la version B prend le controle.
    const loadsBeforeClick = loadCount;
    await page.getByRole('button', { name: 'Actualiser' }).click();
    await expect(page.getByText('Une nouvelle version est disponible.')).toBeHidden({
      timeout: 20000,
    });

    // 6. Pas de boucle de rechargement : exactement une navigation de plus.
    await page.waitForTimeout(2000);
    expect(loadCount - loadsBeforeClick).toBe(1);

    // 5. Les caches de la version A ont ete supprimes a l'activation.
    await expect
      .poll(() => page.evaluate(() => caches.keys()), { timeout: 20000 })
      .not.toContain(shellBefore);

    // 7. Le cache de tuiles, non versionne sur le build, a survecu.
    const tileSurvived = await page.evaluate(async () => {
      const cache = await caches.open('meteo-fr-tiles-v1');
      return (await cache.match('/synthetic-tile.png')) !== undefined;
    });
    expect(tileSurvived).toBe(true);
  });

  test('repli sur offline.html quand le shell precache est incomplet (SERVICE_WORKER.md 13)', async ({
    page,
    context,
    browserName,
  }) => {
    // `context.setOffline()` ne bloque de maniere fiable les `fetch()`
    // emis depuis le service worker lui-meme que sous Chromium : verifie
    // en direct (script jetable), sous Firefox le `fetch(event.request)`
    // de `handleNavigate` continue d'aboutir malgre `setOffline(true)`, ce
    // qui masque completement le repli teste ici. Limitation connue de
    // l'automatisation, pas un defaut de `sw.ts` (le cycle de mise a jour
    // du test precedent, lui, passe sur les trois moteurs).
    test.skip(
      browserName !== 'chromium',
      "setOffline n'intercepte pas le fetch du SW hors Chromium",
    );

    // `handleNavigate` essaie `/index.html` avant `/offline.html` : ce
    // dernier n'est atteint que si meme le shell est absent ou corrompu.
    // On simule ce cas en retirant `/index.html` du cache une fois le SW
    // installe, plutot qu'un tout premier appareil hors ligne (impossible
    // a produire : sans visite prealable, aucun SW n'a jamais pu
    // s'installer pour intercepter quoi que ce soit).
    await page.goto(baseUrl);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 20000,
    });

    await page.evaluate(async () => {
      const names = await caches.keys();
      const shell = names.find((n) => n.startsWith('meteo-fr-shell-'));
      if (shell !== undefined) {
        const cache = await caches.open(shell);
        await cache.delete('/index.html');
      }
    });

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Hors ligne' })).toBeVisible({
      timeout: 20000,
    });
    await context.setOffline(false);
  });
});
