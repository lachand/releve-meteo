#!/usr/bin/env node
// Desenregistre le service worker et vide tous les caches prefixes
// `meteo-fr` sur une origine locale (dev ou preview). SERVICE_WORKER.md
// section 11 : un SW actif en developpement masque les modifications et
// fait perdre un temps considerable ; cette commande evite de repeter la
// manipulation a la main dans les outils de developpement a chaque fois.
//
// Usage : npm run sw:reset [-- http://localhost:5173]

import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5173';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const registrations =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const names = (await caches.keys()).filter((name) => name.startsWith('meteo-fr'));
    await Promise.all(names.map((name) => caches.delete(name)));
    return { unregistered: registrations.length, cachesCleared: names.length };
  });
  console.log(
    `sw:reset — ${result.unregistered} worker(s) desenregistre(s), ${result.cachesCleared} cache(s) supprime(s) sur ${url}`,
  );
} catch (error) {
  console.error(`sw:reset — impossible de contacter ${url}. Le serveur tourne-t-il ?`);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
