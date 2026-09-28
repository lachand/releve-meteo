import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { test } from './fixtures';
import { LYON_URL, stubApis } from './apiStub';

test('la vigilance verte du departement est dite sous les phenomenes, sans bandeau', async ({
  page,
}) => {
  await stubApis(page);
  await page.goto(LYON_URL);
  await expect(page.getByText(/Vigilance Météo-France : verte pour Rhône \(69\)/)).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('region', { name: /^Vigilance/ })).toHaveCount(0);
});

test('une vigilance orange ouvre le releve, avec sa source et sa periode', async ({ page }) => {
  await stubApis(page);
  const raw = JSON.parse(readFileSync('tests/fixtures/live/vigilance-rhone.json', 'utf8')) as {
    results: Record<string, unknown>[];
  };
  raw.results = raw.results.map((record) =>
    record.phenomenon_id === 3 && record.echeance === 'J' ? { ...record, color_id: 3 } : record,
  );
  await page.route('https://public.opendatasoft.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(raw),
    }),
  );
  await page.goto(LYON_URL);
  const banner = page.getByRole('region', { name: 'Vigilance orange · Rhône (69)' });
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(banner).toContainText('Orange orages : aujourd’hui, de 16h à minuit');
  await expect(banner).toContainText('Bulletin de 16h');
  // Le bandeau precede le panneau « Maintenant ».
  const bannerBox = await banner.boundingBox();
  const nowBox = await page.getByText('Maintenant', { exact: true }).boundingBox();
  expect(bannerBox?.y ?? Infinity).toBeLessThan(nowBox?.y ?? 0);
});
