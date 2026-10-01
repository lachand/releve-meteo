import { defineConfig, devices } from '@playwright/test';

// Local dev container : le Chromium telecharge par Playwright est absent,
// mais un build utilisable existe hors de son cache habituel. CI ne
// positionne pas cette variable et garde le telechargement normal.
const chromiumExecutablePath = process.env.PW_CHROMIUM_PATH;
// En CI : le Chromium complet (`channel: 'chromium'`, nouveau mode sans
// interface), pas le « headless shell » par defaut. Dans ce dernier,
// `periodicSync` existe mais `getTags()` echoue (UnknownError, permission
// « prompt ») : la veille y parait toujours non prise en charge, ce qu'aucun
// vrai navigateur ne fait.
const chromiumLaunchOptions =
  chromiumExecutablePath !== undefined
    ? { launchOptions: { executablePath: chromiumExecutablePath } }
    : { channel: 'chromium' };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromiumLaunchOptions } },
    // Firefox et WebKit : `page.route` n'intercepte ni les requetes que le
    // service worker relaie ni les siennes, qui partent alors sur le vrai
    // reseau (geocodage, tuiles) : bruit console, resultats de recherche
    // differents, tests instables en CI. Le service worker y est donc
    // bloque, sauf dans les specs qui le testent (`serviceWorkers: 'allow'`).
    { name: 'firefox', use: { ...devices['Desktop Firefox'], serviceWorkers: 'block' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], serviceWorkers: 'block' } },
    {
      name: 'mobile-380',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 380, height: 720 },
        ...chromiumLaunchOptions,
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
