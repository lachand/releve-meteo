import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { LYON_URL, stubApis } from './apiStub';
import { expect, test } from './fixtures';

/*
 * Lecture rapide : l'accueil ne garde que le bulletin du moment, la pluie au
 * quart d'heure et le creneau sec, en grand. Les vigilances et les alertes
 * restent, et les autres vues sont a un onglet.
 */

async function enableQuickReading(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'meteo-fr:prefs',
      JSON.stringify({
        version: 1,
        favourites: [],
        units: { temperature: 'C', wind: 'kmh' },
        theme: 'auto',
        display: { quick: true },
        solar: { peakKwp: null },
        apiKeys: { vigilance: null, infoclimat: null },
        alerts: [],
      }),
    );
  });
}

test('lecture rapide : l essentiel seulement, et les autres vues restent a un onglet', async ({
  page,
}) => {
  await stubApis(page);
  await enableQuickReading(page);
  await page.goto(LYON_URL);
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('html')).toHaveAttribute('data-lecture', 'rapide');
  await expect(page.getByRole('heading', { name: 'Pluie au quart d’heure' })).toBeVisible();
  await expect(page.getByText(/Lecture rapide : les heures, les jours/)).toBeVisible();
  // Ce qui est retire de l'accueil.
  await expect(page.getByRole('heading', { name: 'Les 24 prochaines heures' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Phénomènes à surveiller' })).toHaveCount(0);
  // Les onglets restent.
  await page.getByRole('tab', { name: 'Modèles' }).click();
  await expect(page.getByRole('tabpanel')).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe : lecture rapide, theme ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await stubApis(page);
    await enableQuickReading(page);
    await page.goto(LYON_URL);
    await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(' ; ')}`,
      ),
    ).toEqual([]);
  });
}

test('capture : lecture rapide', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'References de rendu : Chromium seulement');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await stubApis(page);
  await enableQuickReading(page);
  await page.goto(LYON_URL);
  await expect(page.getByText('Modèle retenu', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await expect(page).toHaveScreenshot('lecture-rapide-light.png', {
    animations: 'disabled',
    threshold: 0.3,
    maxDiffPixelRatio: 0.08,
  });
});
