import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { test } from './fixtures';
import { LYON_URL, stubApis } from './apiStub';

/*
 * Veille en arriere-plan, de bout en bout dans Chromium : un vrai
 * evenement `periodicsync` est livre au service worker (protocole
 * DevTools), qui recharge la prevision et la vigilance, et notifie.
 *
 * L'horloge du service worker n'est pas figee (celle de la page seule
 * l'est) : les reponses enregistrees sont decalees d'autant de jours
 * qu'il en separe aujourd'hui, pour rester a venir.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXTURE_DAY = Date.parse('2026-09-28T00:00:00Z');

function live(name: string): unknown {
  return JSON.parse(readFileSync(`tests/fixtures/live/${name}`, 'utf8')) as unknown;
}

/** Decale un horodatage ISO ('YYYY-MM-DD', 'YYYY-MM-DDTHH:mm' ou complet) de `days` jours. */
function shiftIso(iso: string, days: number): string {
  const shifted = (ms: number) => new Date(ms + days * DAY_MS).toISOString();
  if (iso.length === 10) {
    return shifted(Date.parse(`${iso}T00:00:00Z`)).slice(0, 10);
  }
  if (iso.length === 16) {
    return shifted(Date.parse(`${iso}:00Z`)).slice(0, 16);
  }
  return shifted(Date.parse(iso));
}

async function stubWorkerApis(context: BrowserContext, days: number): Promise<void> {
  const forecast = live('forecast-lyon.json') as {
    hourly: { time: string[] };
    daily: { time: string[] };
  };
  forecast.hourly.time = forecast.hourly.time.map((t) => shiftIso(t, days));
  forecast.daily.time = forecast.daily.time.map((t) => shiftIso(t, days));
  const vigilance = live('vigilance-rhone.json') as { results: Record<string, unknown>[] };
  vigilance.results = vigilance.results.map((record) => ({
    ...record,
    // Orages en orange, aujourd'hui et demain.
    color_id: record.phenomenon_id === 3 ? 3 : record.color_id,
    begin_time: shiftIso(String(record.begin_time), days),
    end_time: shiftIso(String(record.end_time), days),
    product_datetime: shiftIso(String(record.product_datetime), days),
  }));
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
  // context.route : seul a voir les requetes du service worker.
  await context.route('https://api.open-meteo.com/**', (route) => route.fulfill(json(forecast)));
  await context.route('https://public.opendatasoft.com/**', (route) =>
    route.fulfill(json(vigilance)),
  );
}

/** Etat de veille ecrit comme la page le recopierait. */
async function seedWatch(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const place = {
      id: '45.7578:4.8320',
      name: 'Lyon',
      latitude: 45.7578,
      longitude: 4.832,
      elevation: 170,
      admin: 'Rhône',
      alias: null,
    };
    const state = {
      entries: [
        {
          place,
          department: { code: '69', name: 'Rhône' },
          rules: [
            {
              id: 'doux',
              placeId: place.id,
              variable: 'temperature',
              comparator: 'gt',
              threshold: 5,
              enabled: true,
            },
          ],
          terrain: null,
          verification: [],
          preferred: null,
        },
      ],
      windUnit: 'kmh',
      notified: {},
      lastRunUtcMs: null,
    };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('meteo-fr');
      open.onerror = () => reject(open.error ?? new Error('ouverture'));
      open.onsuccess = () => {
        const tx = open.result.transaction('datasets', 'readwrite');
        tx.objectStore('datasets').put({
          key: 'watch.v1|all',
          value: state,
          storedAt: Date.now(),
          expiresAt: Number.MAX_SAFE_INTEGER,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('ecriture'));
      };
    });
  });
}

async function dispatchPeriodicSync(page: Page, tag: string): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', (event) => {
      const registration = event.registrations.find((r) => !r.isDeleted);
      if (registration !== undefined) {
        resolve(registration.registrationId);
      }
    });
  });
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.dispatchPeriodicSyncEvent', {
    origin: new URL(page.url()).origin,
    registrationId: await registrationId,
    tag,
  });
}

/** Notification que le service worker a demande d'afficher. */
interface Shown {
  readonly title: string;
  readonly body: string;
}

/**
 * Espionne `showNotification` dans le service worker : le test verifie ce
 * que la veille decide de notifier, pas la couche de notifications du
 * systeme, absente ou reduite dans les Chromium sans interface des CI.
 */
async function spyOnNotifications(context: BrowserContext): Promise<Worker> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(() => {
    const scope = self as unknown as {
      __shown: { title: string; body: string }[];
      registration: {
        showNotification(title: string, options?: { body?: string }): Promise<void>;
      };
    };
    scope.__shown = [];
    const registration = scope.registration;
    const original = registration.showNotification.bind(registration);
    registration.showNotification = async (title, options) => {
      scope.__shown.push({ title, body: options?.body ?? '' });
      try {
        await original(title, options);
      } catch {
        // Pas de notifications dans ce navigateur de test : sans importance ici.
      }
    };
  });
  return worker;
}

async function shownNotifications(worker: Worker): Promise<Shown[]> {
  return worker.evaluate(
    () => (self as unknown as { __shown: { title: string; body: string }[] }).__shown,
  );
}

test('la veille notifie une alerte franchie et une vigilance orange, une seule fois', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Periodic Background Sync et DevTools : Chromium seul');
  const days = Math.floor((Date.now() - FIXTURE_DAY) / DAY_MS);
  await stubApis(page);
  await stubWorkerApis(context, days);
  await context.grantPermissions(['notifications']);
  await page.goto(LYON_URL);
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await seedWatch(page);
  const worker = await spyOnNotifications(context);

  await dispatchPeriodicSync(page, 'releve-veille');
  await expect
    .poll(async () => (await shownNotifications(worker)).map((n) => n.title).sort(), {
      timeout: 15000,
    })
    .toEqual(['Lyon · Température au-dessus de 5\u00a0°C', 'Vigilance orange orages · Rhône (69)']);

  // Provenance : le modele de la valeur, et la source de la vigilance.
  const bodies = (await shownNotifications(worker)).map((n) => n.body).sort();
  expect(bodies[0]).toMatch(/^Dès .+ selon [A-Z][\w -]+, .+\.$/);
  expect(bodies[1]).toMatch(/Bulletin Météo-France de \d\dh, pour Lyon\.$/);

  // Une seconde veille ne renotifie rien : les cles sont notees.
  await dispatchPeriodicSync(page, 'releve-veille');
  await page.waitForTimeout(1500);
  expect(await shownNotifications(worker)).toHaveLength(2);
});

test('les reglages disent ce que ce navigateur permet pour la veille, sans promesse', async ({
  page,
  context,
  browserName,
}) => {
  // Permission accordee : sans cela, un Chromium sans interface la refuse par
  // defaut et l'interface dirait « bloquees », un autre etat que celui teste.
  await context.grantPermissions(['notifications']);
  await stubApis(page);
  await page.goto(LYON_URL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole('button', { name: 'Réglages' }).click();
  const section = page.getByRole('region', { name: 'Veille en arrière-plan' });
  if (browserName === 'chromium') {
    // Onglet de navigateur, pas application installee : Chromium refuse la
    // synchronisation periodique, et l'interface dit comment l'obtenir.
    await expect(section.getByRole('status')).toContainText(
      'n’accorde la veille qu’aux applications installées',
      { timeout: 10000 },
    );
  } else {
    await expect(section.getByRole('status')).toContainText(
      'ne permet pas la veille en arrière-plan',
      { timeout: 10000 },
    );
    await expect(section.getByRole('button')).toHaveCount(0);
    return;
  }
  await expect(section.getByRole('button', { name: 'Activer la veille' })).toBeVisible();
});
